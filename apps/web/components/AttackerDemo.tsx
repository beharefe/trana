"use client"

import { useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  PublicKey,
  Transaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"
import type { VaultStatusResponse } from "@trana-guard/sdk"

const PROGRAM_ID    = process.env.NEXT_PUBLIC_PROGRAM_ID ?? ""
const THRESHOLD_SOL = Number(process.env.NEXT_PUBLIC_GUARD_THRESHOLD_SOL ?? "20")
const SOL           = 1_000_000_000

// Same discriminators as VaultPanel
const DISC_VAULT_WITHDRAW = Buffer.from([157, 202, 21, 129, 223, 192, 36, 219])

interface TxResult {
  ok:    boolean
  label: string
  desc:  string
  sig?:  string
}

interface Props {
  vault: VaultStatusResponse | null
}

/**
 * Demonstrates that the private key alone is insufficient.
 *
 * Sends a raw vault_withdraw transaction WITHOUT any passkey proof.
 * Expected result: transaction fails with MissingProof.
 */
export function AttackerDemo({ vault }: Props) {
  const { connection }     = useConnection()
  const { publicKey, signTransaction } = useWallet()

  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<TxResult | null>(null)

  async function simulateAttack() {
    if (!publicKey || !signTransaction || !vault?.initialized) return
    setLoading(true)
    setResult(null)

    try {
      const attackAmount = Math.round(THRESHOLD_SOL * SOL * 1.5) // clearly above threshold
      const [configPda]  = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        new PublicKey(PROGRAM_ID)
      )
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), publicKey.toBuffer()],
        new PublicKey(PROGRAM_ID)
      )
      const dest = PublicKey.unique()

      const amountBuf = Buffer.allocUnsafe(8)
      const nonceBuf  = Buffer.allocUnsafe(8)
      const expiryBuf = Buffer.allocUnsafe(8)
      amountBuf.writeBigUInt64LE(BigInt(attackAmount))
      nonceBuf.writeBigUInt64LE(BigInt(vault.next_nonce))
      expiryBuf.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 300))

      const data = Buffer.concat([
        DISC_VAULT_WITHDRAW,
        amountBuf,
        nonceBuf,
        Buffer.alloc(32),  // zero payload_hash — proof is absent
        expiryBuf,
      ])
      const ix = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: vaultPda,  isSigner: false, isWritable: true  },
          { pubkey: publicKey, isSigner: true,  isWritable: false },
          { pubkey: dest,      isSigner: false, isWritable: true  },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        ],
        data,
      }

      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)

      // Sign and submit — no proof instruction attached
      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")

      // If we somehow get here, something is wrong
      setResult({
        ok:    false,
        label: "Unexpected: transaction succeeded",
        desc:  "The guard failed to reject an unproven withdrawal.",
        sig,
      })
    } catch (e: unknown) {
      const msg = String(e)
      const isMissingProof =
        msg.includes("MissingProof") || msg.includes("0x1770")

      setResult({
        ok:    false,
        label: isMissingProof
          ? "✅ Correctly rejected — MissingProof"
          : "Transaction failed (unexpected error)",
        desc: isMissingProof
          ? "Attacker had the private key but the program rejected the transaction. Private key alone is insufficient."
          : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  const canDemo = vault?.initialized && vault.balance_sol > 0 && PROGRAM_ID

  return (
    <div className="border border-red-900/40 rounded-lg bg-red-950/10 overflow-hidden">
      <div className="px-5 py-4 border-b border-red-900/30">
        <h3 className="text-sm font-bold text-red-400">Attacker Simulation</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Simulates an attacker who has obtained the private key
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex gap-2">
            <span className="text-gray-600">→</span>
            <span>Attacker holds the wallet private key</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-600">→</span>
            <span>Attacker builds a raw withdrawal transaction</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-600">→</span>
            <span>No passkey proof attached (attacker doesn&apos;t have it)</span>
          </div>
          <div className="flex gap-2 font-semibold">
            <span className="text-red-600">→</span>
            <span className="text-red-400">Expected: transaction fails with MissingProof</span>
          </div>
        </div>

        <button
          onClick={simulateAttack}
          disabled={loading || !canDemo}
          className="w-full bg-red-900/50 hover:bg-red-900/70 disabled:bg-gray-800 disabled:text-gray-600 text-red-200 border border-red-900/50 rounded px-4 py-2.5 text-sm font-mono transition-colors"
        >
          {loading
            ? "Sending attack tx…"
            : !canDemo
            ? "Create vault + deposit first"
            : "Simulate attack (no proof)"}
        </button>

        {result && (
          <div
            className={`p-3 rounded border text-xs font-mono ${
              result.label.startsWith("✅")
                ? "bg-green-900/20 border-green-800 text-green-300"
                : "bg-red-900/20 border-red-800 text-red-300"
            }`}
          >
            <div className="font-bold mb-1">{result.label}</div>
            <div className="text-gray-400 whitespace-pre-wrap break-all">{result.desc}</div>
          </div>
        )}
      </div>
    </div>
  )
}
