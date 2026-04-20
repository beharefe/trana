"use client"

import { useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"
import { findRegistryPda } from "@trana-guard/sdk"
import type { VaultStatusResponse } from "@trana-guard/sdk"

const VAULT_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "RuY1hQfDuxojWEioSsQy81ByaK6LhB1UvKhDGygWxnW"
)
const GUARD_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID || "BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb"
)

const WITHDRAW_DISC = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34])
const LARGE_AMOUNT  = BigInt(1_000_000_000) // 1 SOL

function findVaultPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    VAULT_PROGRAM_ID
  )
  return pda
}

function u64LE(n: bigint): Buffer {
  const buf  = Buffer.allocUnsafe(8)
  const view = new DataView(buf.buffer, buf.byteOffset, 8)
  view.setBigUint64(0, n, true)
  return buf
}

interface Props {
  vault: VaultStatusResponse | null
}

export function AttackerDemo({ vault }: Props) {
  const { connection }               = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [busy,   setBusy]   = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function attack() {
    if (!publicKey) return
    setBusy(true); setResult(null)
    try {
      const vaultPda    = findVaultPda(publicKey)
      const registryPda = findRegistryPda(publicKey, GUARD_PROGRAM_ID)

      // Raw withdraw — no secp256r1 precompile, no record_proof
      const withdrawIx = new TransactionInstruction({
        programId: VAULT_PROGRAM_ID,
        keys: [
          { pubkey: vaultPda,                    isSigner: false, isWritable: true  },
          { pubkey: publicKey,                   isSigner: true,  isWritable: false },
          { pubkey: publicKey,                   isSigner: false, isWritable: true  }, // destination = self
          { pubkey: GUARD_PROGRAM_ID,            isSigner: false, isWritable: false },
          { pubkey: registryPda,                 isSigner: false, isWritable: true  },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,  isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([WITHDRAW_DISC, u64LE(LARGE_AMOUNT)]),
      })

      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(withdrawIx)

      await sendTransaction(tx, connection, { skipPreflight: false })
      // shouldn't reach here
      setResult({ ok: true, msg: "Withdraw succeeded — guard not working!" })
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      const known =
        msg.includes("MissingProof")     ? "MissingProof (0x1770) — guard rejected: no secp256r1 proof in transaction" :
        msg.includes("0x1770")           ? "MissingProof (0x1770) — guard rejected: no secp256r1 proof in transaction" :
        msg.includes("custom program error") ? `Chain rejected: ${msg.slice(0, 200)}` :
        msg.slice(0, 200)
      setResult({ ok: false, msg: known })
    } finally {
      setBusy(false)
    }
  }

  const hasVault    = vault && vault.initialized && vault.balance_sol >= 1
  const notConnected = !publicKey

  return (
    <section className="border border-red-900/40 rounded-lg p-5 bg-red-950/10 space-y-3">
      <div>
        <h2 className="text-xs font-semibold text-red-400/70 uppercase tracking-widest">
          Attacker demo
        </h2>
        <p className="text-xs text-gray-600 mt-1">
          Submits a 1 SOL withdrawal with only a wallet signature — no passkey proof.
        </p>
      </div>

      <button
        onClick={attack}
        disabled={busy || notConnected || !hasVault}
        className="w-full text-xs px-3 py-2 rounded border border-red-800/60 bg-red-950/30 text-red-400 hover:bg-red-900/30 disabled:opacity-40 transition-colors font-mono"
        title={!hasVault ? "Need ≥1 SOL in vault to trigger the guard" : undefined}
      >
        {busy ? "Sending raw tx…" : "⚔️  Attack: withdraw without passkey"}
      </button>

      {!hasVault && !notConnected && (
        <p className="text-xs text-gray-600 italic">
          Deposit ≥1 SOL first to trigger the guard threshold.
        </p>
      )}

      {result && (
        <div className={`rounded p-3 text-xs font-mono break-all border ${
          result.ok
            ? "bg-green-950/30 border-green-800/40 text-green-400"
            : "bg-black/40 border-red-900/40 text-red-400"
        }`}>
          {result.ok ? "✅ " : "🛡️  "}{result.msg}
        </div>
      )}
    </section>
  )
}
