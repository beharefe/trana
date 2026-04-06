"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useWallet, useConnection } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js"
import { startRegistration } from "@simplewebauthn/browser"
import { fetchRegistrationOptions } from "@trana-guard/sdk"

const TRANA_PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? ""

type Stage =
  | "idle"
  | "webauthn"          // WebAuthn ceremony running
  | "submitting"        // Building + submitting onchain tx
  | "done"
  | "error"

const STAGE_LABEL: Record<Stage, string> = {
  idle:       "Register passkey",
  webauthn:   "Complete passkey setup in your browser...",
  submitting: "Submitting registration to Solana...",
  done:       "Passkey registered onchain.",
  error:      "Registration failed",
}

export default function RegisterPage() {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const router = useRouter()
  const params = useSearchParams()

  const redirectUrl = params.get("redirect") ?? "/"
  const wallet = publicKey?.toBase58() ?? null

  const [stage, setStage] = useState<Stage>("idle")
  const [error, setError] = useState<string | null>(null)
  const serverUrl = typeof window !== "undefined" ? window.location.origin : ""

  async function handleRegister() {
    if (!wallet || !publicKey || !signTransaction) return
    setError(null)

    try {
      // ── Step 1: WebAuthn registration ceremony ──────────────────────────────
      setStage("webauthn")

      const optionsRes = await fetchRegistrationOptions(wallet, serverUrl) as {
        options: Parameters<typeof startRegistration>[0]["optionsJSON"]
      }
      const regResponse = await startRegistration({ optionsJSON: optionsRes.options })

      // Send to backend to verify and extract the P-256 public key.
      // The backend is a UX helper — NOT a trust anchor.
      const verifyRes = await fetch(`${serverUrl}/api/register/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallet, response: regResponse }),
      }).then(r => r.json()) as {
        success:       boolean
        p256PublicKey: string   // hex 33-byte compressed P-256
        credentialId:  string
        error?:        string
      }

      if (!verifyRes.success || !verifyRes.p256PublicKey) {
        throw new Error(verifyRes.error ?? "WebAuthn verification failed")
      }

      // ── Step 2: Register the P-256 pubkey onchain ───────────────────────────
      // This is the actual security registration — the Supabase write above
      // is only for the Ed25519 bridge demo path and UX hints.
      setStage("submitting")

      const p256PubKey  = Buffer.from(verifyRes.p256PublicKey, "hex")
      const credentialId = Buffer.from(verifyRes.credentialId, "base64url")

      // Derive registry PDA: [b"2fa", owner]
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("2fa"), publicKey.toBuffer()],
        new PublicKey(TRANA_PROGRAM_ID)
      )

      // Build register_two_fa instruction using Anchor discriminator.
      // discriminator = sha256("global:register_two_fa")[0..8]
      // Pre-computed: [0x63, 0xef, 0x62, 0x7d, 0x8a, 0x0c, 0x95, 0x4e]
      const REGISTER_DISCRIMINATOR = Buffer.from([
        0x63, 0xef, 0x62, 0x7d, 0x8a, 0x0c, 0x95, 0x4e,
      ])

      // Encode arguments:
      //   key_kind:       enum variant 0 = Secp256r1Passkey (1 byte)
      //   pubkey_bytes:   Vec<u8> = 4-byte LE length prefix + bytes
      //   credential_id:  Vec<u8> = 4-byte LE length prefix + bytes
      const keyKindBuf = Buffer.from([0])  // 0 = Secp256r1Passkey

      const pkLenBuf = Buffer.allocUnsafe(4)
      pkLenBuf.writeUInt32LE(p256PubKey.length)

      const credLenBuf = Buffer.allocUnsafe(4)
      credLenBuf.writeUInt32LE(credentialId.length)

      const ixData = Buffer.concat([
        REGISTER_DISCRIMINATOR,
        keyKindBuf,
        pkLenBuf,
        p256PubKey,
        credLenBuf,
        credentialId,
      ])

      const registerIx = new TransactionInstruction({
        programId: new PublicKey(TRANA_PROGRAM_ID),
        keys: [
          { pubkey: registryPda,           isSigner: false, isWritable: true },
          { pubkey: publicKey,             isSigner: true,  isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: ixData,
      })

      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(registerIx)

      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")

      setStage("done")
      setTimeout(() => {
        router.push(redirectUrl)
      }, 1500)

    } catch (err: unknown) {
      console.error("[register]", err)
      setError(err instanceof Error ? err.message : "Registration failed")
      setStage("error")
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-mono flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-green-400">Register passkey</h1>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Links your passkey to your wallet. The P-256 public key is stored
            in a Trana registry PDA onchain — no backend holds your key.
          </p>
        </div>

        {!wallet ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Connect your wallet first.</p>
            <WalletMultiButton />
          </div>
        ) : (
          <div className="border border-gray-800 rounded-lg p-5 bg-gray-900/30 space-y-4">
            <p className="text-xs text-gray-400 break-all">
              Wallet: <span className="text-gray-300">{wallet}</span>
            </p>

            <div
              className={`text-sm py-2 px-3 rounded ${
                stage === "done"
                  ? "bg-green-900/30 text-green-400"
                  : stage === "error"
                  ? "bg-red-900/30 text-red-400"
                  : stage !== "idle"
                  ? "bg-gray-800 text-gray-300"
                  : "text-gray-400"
              }`}
            >
              {STAGE_LABEL[stage]}
            </div>

            {stage === "submitting" && (
              <p className="text-xs text-gray-500">
                Calling <code className="text-gray-400">register_two_fa</code> on
                the Trana program. Your wallet will prompt for a signature.
              </p>
            )}

            {error && (
              <pre className="text-xs text-red-400 whitespace-pre-wrap break-all">
                {error}
              </pre>
            )}

            {(stage === "idle" || stage === "error") && (
              <button
                onClick={handleRegister}
                className="w-full bg-green-700 hover:bg-green-600 text-white rounded px-4 py-2.5 text-sm font-mono transition-colors"
              >
                {stage === "error" ? "Try again" : "Register passkey"}
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-gray-600">
          Security model: the backend verifies the WebAuthn ceremony for UX
          purposes only. The onchain PDA is the trust anchor. A compromised
          backend cannot authorize transactions on your behalf.
        </p>

      </div>
    </main>
  )
}
