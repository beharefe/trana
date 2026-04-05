"use client"

import { useCallback, useEffect, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"
import {
  getVaultProof,
  getVaultStatus,
  attachProof,
  generateNonce,
  type VaultProofPayload,
  type VaultStatusResponse,
} from "@trana-guard/sdk"

const PROGRAM_ID      = process.env.NEXT_PUBLIC_PROGRAM_ID ?? ""
const THRESHOLD_SOL   = Number(process.env.NEXT_PUBLIC_GUARD_THRESHOLD_SOL ?? "20")
const SOL             = 1_000_000_000

// Anchor discriminators (sha256("global:<name>")[0..8])
// Replace these with values from `target/idl/guard.json` after `anchor build`.
const DISC = {
  initVault:     [166, 231,  27, 195,  240, 103, 160,  91],
  deposit:       [242, 35, 198,   137,  82, 225, 242, 182],
  vaultWithdraw: [157, 202,  21, 129,  223, 192,  36, 219],
} as const

type VaultAction = "init" | "deposit" | "withdraw" | null

interface Props {
  onTxSuccess?: (sig: string, label: string) => void
  onTxError?:   (err: string, label: string) => void
}

export function VaultPanel({ onTxSuccess, onTxError }: Props) {
  const { connection }                           = useConnection()
  const { publicKey, signTransaction, sendTransaction } = useWallet()

  const [vault,     setVault]     = useState<VaultStatusResponse | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [action,    setAction]    = useState<VaultAction>(null)
  const [amountStr, setAmountStr] = useState("")
  const [destStr,   setDestStr]   = useState("")

  const wallet     = publicKey?.toBase58() ?? null
  const serverUrl  = typeof window !== "undefined" ? window.location.origin : ""
  const amountSol  = parseFloat(amountStr) || 0
  const lamports   = Math.round(amountSol * SOL)

  const refresh = useCallback(async () => {
    if (!wallet) { setVault(null); return }
    const v = await getVaultStatus(wallet, serverUrl)
    setVault(v)
  }, [wallet, serverUrl])

  useEffect(() => { refresh() }, [refresh])

  async function handleInitVault() {
    if (!publicKey || !sendTransaction) return
    setLoading(true)
    try {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), publicKey.toBuffer()],
        new PublicKey(PROGRAM_ID)
      )
      const data = Buffer.concat([
        Buffer.from(DISC.initVault),
        Buffer.from([0]), // opt_in = false
      ])
      const ix = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
          { pubkey: vaultPda,              isSigner: false, isWritable: true },
          { pubkey: publicKey,             isSigner: true,  isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }
      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, "confirmed")
      onTxSuccess?.(sig, "Vault initialised")
      await refresh()
    } catch (e: unknown) {
      onTxError?.(String(e), "init_vault failed")
    } finally {
      setLoading(false)
      setAction(null)
    }
  }

  async function handleDeposit() {
    if (!publicKey || !sendTransaction || !lamports) return
    setLoading(true)
    try {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), publicKey.toBuffer()],
        new PublicKey(PROGRAM_ID)
      )
      // Anchor deposit instruction
      const amountBuf = Buffer.allocUnsafe(8)
      amountBuf.writeBigUInt64LE(BigInt(lamports))
      const data = Buffer.concat([Buffer.from(DISC.deposit), amountBuf])
      const ix = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
          { pubkey: vaultPda,              isSigner: false, isWritable: true },
          { pubkey: publicKey,             isSigner: true,  isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }
      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, "confirmed")
      onTxSuccess?.(sig, `Deposited ${amountSol} SOL`)
      setAmountStr("")
      await refresh()
    } catch (e: unknown) {
      onTxError?.(String(e), "deposit failed")
    } finally {
      setLoading(false)
      setAction(null)
    }
  }

  async function handleWithdraw() {
    if (!publicKey || !signTransaction || !lamports || !destStr || !vault) return
    setLoading(true)
    try {
      let destKey: PublicKey
      try { destKey = new PublicKey(destStr) }
      catch { onTxError?.("Invalid destination address", "withdraw"); return }

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), publicKey.toBuffer()],
        new PublicKey(PROGRAM_ID)
      )

      const nonce  = vault.next_nonce
      const expiry = Math.floor(Date.now() / 1000) + 300 // 5 min TTL

      // ── Policy: Any([HighValueTransfer, UserOptIn]) ───────────────────────
      const requires2FA =
        amountSol >= THRESHOLD_SOL || vault.opt_in

      let proof = null
      if (requires2FA) {
        const payload: VaultProofPayload = {
          programId:   PROGRAM_ID,
          instruction: "vault_withdraw",
          vault:       vaultPda.toBase58(),
          amount:      lamports,
          nonce,
          expiry,
        }
        proof = await getVaultProof(payload, serverUrl)
      }

      // ── Build vault_withdraw instruction ─────────────────────────────────
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        new PublicKey(PROGRAM_ID)
      )
      const amountBuf  = Buffer.allocUnsafe(8)
      const nonceBuf   = Buffer.allocUnsafe(8)
      const expiryBuf  = Buffer.allocUnsafe(8)
      const hashBuf    = proof ? Buffer.from(proof.payloadHash) : Buffer.alloc(32)
      amountBuf.writeBigUInt64LE(BigInt(lamports))
      nonceBuf.writeBigUInt64LE(BigInt(nonce))
      expiryBuf.writeBigInt64LE(BigInt(expiry))

      const data = Buffer.concat([
        Buffer.from(DISC.vaultWithdraw),
        amountBuf,
        nonceBuf,
        hashBuf,
        expiryBuf,
      ])
      const ix = {
        programId: new PublicKey(PROGRAM_ID),
        keys: [
          { pubkey: configPda,             isSigner: false, isWritable: false },
          { pubkey: vaultPda,              isSigner: false, isWritable: true  },
          { pubkey: publicKey,             isSigner: true,  isWritable: false },
          { pubkey: destKey,               isSigner: false, isWritable: true  },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        ],
        data,
      }

      const { blockhash } = await connection.getLatestBlockhash()
      let tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)
      if (proof) tx = attachProof(tx, proof)

      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")

      onTxSuccess?.(sig, `Withdrew ${amountSol} SOL${requires2FA ? " (2FA verified)" : ""}`)
      setAmountStr("")
      setDestStr("")
      await refresh()
    } catch (e: unknown) {
      const msg = String(e)
      const label =
        msg.includes("MissingProof")   ? "❌ FAIL: MissingProof — no proof attached"       :
        msg.includes("InvalidNonce")   ? "❌ FAIL: InvalidNonce — replay attempt rejected"  :
        msg.includes("PayloadMismatch")? "❌ FAIL: PayloadMismatch — tampered parameters"   :
        msg.includes("ProofExpired")   ? "❌ FAIL: ProofExpired — proof too old"            :
        "Withdraw failed"
      onTxError?.(msg, label)
    } finally {
      setLoading(false)
      setAction(null)
    }
  }

  if (!wallet) return null

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden">
      {/* Vault header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-bold text-gray-200">Guarded Vault</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {vault?.initialized
              ? "Deposits protected — private key alone cannot withdraw"
              : "Create a vault to begin the demo"}
          </p>
        </div>
        {vault?.initialized && (
          <div className="text-right">
            <div className="text-xl font-bold text-indigo-300 tabular-nums">
              {vault.balance_sol.toFixed(4)}
              <span className="text-sm text-gray-500 ml-1">SOL</span>
            </div>
            <div className="text-xs text-gray-600">available</div>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Init vault */}
        {!vault?.initialized && (
          <button
            onClick={handleInitVault}
            disabled={loading || !PROGRAM_ID}
            className="w-full bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded px-4 py-2.5 text-sm font-mono transition-colors"
          >
            {loading ? "Creating…" : "Create vault →"}
          </button>
        )}

        {vault?.initialized && (
          <>
            {/* Action selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setAction(action === "deposit" ? null : "deposit")}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${
                  action === "deposit"
                    ? "border-green-700 bg-green-900/30 text-green-300"
                    : "border-gray-700 bg-gray-800/50 text-gray-400 hover:text-gray-200"
                }`}
              >
                + Deposit
              </button>
              <button
                onClick={() => setAction(action === "withdraw" ? null : "withdraw")}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${
                  action === "withdraw"
                    ? "border-orange-700 bg-orange-900/30 text-orange-300"
                    : "border-gray-700 bg-gray-800/50 text-gray-400 hover:text-gray-200"
                }`}
              >
                → Withdraw
              </button>
            </div>

            {/* Deposit form */}
            {action === "deposit" && (
              <div className="space-y-2">
                <input
                  type="number" step="0.1" min="0.001"
                  placeholder="Amount (SOL)"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-green-600"
                />
                <button
                  onClick={handleDeposit}
                  disabled={loading || !lamports}
                  className="w-full bg-green-800 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded px-4 py-2 text-sm font-mono transition-colors"
                >
                  {loading ? "Depositing…" : "Deposit →"}
                </button>
              </div>
            )}

            {/* Withdraw form */}
            {action === "withdraw" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.1" min="0.001"
                    placeholder="Amount (SOL)"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-orange-600"
                  />
                  <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                    amountSol >= THRESHOLD_SOL || vault.opt_in
                      ? "bg-orange-900/40 text-orange-400 border border-orange-800"
                      : "bg-gray-800 text-gray-500 border border-gray-700"
                  }`}>
                    {amountSol >= THRESHOLD_SOL || vault.opt_in ? "🔑 2FA" : "No 2FA"}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Destination address (base58)"
                  value={destStr}
                  onChange={(e) => setDestStr(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-orange-600"
                />
                <p className="text-xs text-gray-600">
                  Threshold: {THRESHOLD_SOL} SOL — above this requires passkey approval
                </p>
                <button
                  onClick={handleWithdraw}
                  disabled={loading || !lamports || !destStr}
                  className="w-full bg-orange-800 hover:bg-orange-700 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded px-4 py-2 text-sm font-mono transition-colors"
                >
                  {loading ? "Withdrawing…" : "Withdraw →"}
                </button>
              </div>
            )}

            {/* Vault details */}
            <div className="text-xs text-gray-600 border-t border-gray-800/60 pt-3 space-y-1">
              <div className="flex justify-between">
                <span>Next nonce</span>
                <span className="text-gray-500 tabular-nums">{vault.next_nonce}</span>
              </div>
              <div className="flex justify-between">
                <span>Opt-in 2FA</span>
                <span className={vault.opt_in ? "text-yellow-500" : "text-gray-500"}>
                  {vault.opt_in ? "active" : "off"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
