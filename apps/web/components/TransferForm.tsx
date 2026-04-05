"use client"

import { useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"
import {
  checkRequirement,
  getPasskeyProof,
  attachProof,
  generateNonce,
  type ProofPayload,
} from "@trana-guard/sdk"
import { ScenarioResult } from "./ScenarioResult"

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? ""
const THRESHOLD_SOL = Number(process.env.NEXT_PUBLIC_GUARD_THRESHOLD_SOL ?? "20")
const SOL = 1_000_000_000

type Result = {
  ok: boolean
  label: string
  description: string
  txSig?: string
  error?: string
}

interface Props {
  onStatusRefresh?: () => void
}

export function TransferForm({ onStatusRefresh }: Props) {
  const { connection } = useConnection()
  const wallet = useWallet()

  const [amount, setAmount] = useState("")
  const [recipient, setRecipient] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const amountSol = parseFloat(amount) || 0
  const needs2FA = amountSol >= THRESHOLD_SOL
  const serverUrl = typeof window !== "undefined" ? window.location.origin : ""

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!wallet.publicKey || !wallet.signTransaction) return
    setLoading(true)
    setResult(null)

    try {
      const fromKey = wallet.publicKey
      let toKey: PublicKey
      try {
        toKey = new PublicKey(recipient)
      } catch {
        setResult({ ok: false, label: "Invalid recipient", description: "Not a valid Solana address.", error: "Invalid base58 public key" })
        return
      }

      const lamports = Math.round(amountSol * SOL)
      const nonce = generateNonce()
      const expiry = Math.floor(Date.now() / 1000) + 300 // 5 min

      // ── Client-side policy evaluation ────────────────────────────────────
      const req = await checkRequirement(
        { wallet: fromKey.toBase58(), amount: lamports, serverUrl },
        THRESHOLD_SOL
      )

      let proof = null
      if (req.required) {
        const payload: ProofPayload = {
          programId: PROGRAM_ID,
          instruction: "transfer",
          amount: lamports,
          nonce,
          expiry,
        }
        proof = await getPasskeyProof(payload, serverUrl)
      }

      // ── Build the protected_transfer instruction ──────────────────────────
      // We call the Anchor program's protected_transfer instruction.
      // For MVP simplicity we also build a raw transaction; in production
      // you'd use the generated Anchor TypeScript client.
      const nonceBytes = Buffer.from(nonce, "hex")
      const payloadHashBytes = proof?.payloadHash ?? new Uint8Array(32)

      // Anchor discriminator for "protected_transfer"
      const discriminator = Buffer.from([
        // sha256("global:protected_transfer")[0..8]
        0x3c, 0x8d, 0x2a, 0x5e, 0x7f, 0x1b, 0x94, 0xc0,
      ])

      const data = Buffer.concat([
        discriminator,
        Buffer.from(new BigUint64Array([BigInt(lamports)]).buffer), // amount u64 LE
        nonceBytes,                                                  // nonce [u8;32]
        Buffer.from(payloadHashBytes),                              // payload_hash [u8;32]
        Buffer.from(new BigInt64Array([BigInt(expiry)]).buffer),    // expiry i64 LE
        Buffer.from([req.required ? 1 : 0]),                        // user_opt_in bool
      ])

      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        new PublicKey(PROGRAM_ID)
      )
      const [noncePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("nonce"), nonceBytes],
        new PublicKey(PROGRAM_ID)
      )

      const transferIx = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: noncePDA, isSigner: false, isWritable: true },
          { pubkey: fromKey, isSigner: true, isWritable: true },
          { pubkey: toKey, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }

      const { blockhash } = await connection.getLatestBlockhash()
      let tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromKey })
      tx.add(transferIx)

      if (proof) {
        tx = attachProof(tx, proof)
      }

      const signed = await wallet.signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")

      const label = req.required
        ? "Scenario 3 — 2FA + large transfer: SUCCESS"
        : "Scenario 1 — Small transfer: SUCCESS"

      setResult({ ok: true, label, description: `${amountSol} SOL transferred.`, txSig: sig })
      onStatusRefresh?.()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const label = message.includes("MissingProof")
        ? "Scenario 2 — No passkey: FAIL"
        : message.includes("NonceAlreadyUsed")
        ? "Scenario 4 — Replay: FAIL"
        : message.includes("PayloadMismatch")
        ? "Scenario 5 — Tampered payload: FAIL"
        : "Transaction failed"
      setResult({ ok: false, label, description: message, error: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSend} className="space-y-3">
        {/* Amount */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Amount (SOL)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
            />
            <span
              className={`text-xs px-2 py-1 rounded ${
                needs2FA
                  ? "bg-orange-900/40 text-orange-400 border border-orange-800"
                  : "bg-gray-800 text-gray-400 border border-gray-700"
              }`}
            >
              {needs2FA ? "🔑 2FA required" : "No 2FA"}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Threshold: {THRESHOLD_SOL} SOL — amounts above this require passkey approval
          </p>
        </div>

        {/* Recipient */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Recipient address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Base58 public key"
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !wallet.publicKey || !amount || !recipient}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded px-4 py-2.5 text-sm font-mono transition-colors"
        >
          {loading ? "Sending…" : "Send →"}
        </button>
      </form>

      <ScenarioResult result={result} />
    </div>
  )
}
