"use client"

import { useState, useEffect, useCallback } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"
import { useTrana, findRegistryPda } from "@trana-guard/sdk"

const VAULT_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "RuY1hQfDuxojWEioSsQy81ByaK6LhB1UvKhDGygWxnW"
)
const GUARD_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID || "BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb"
)

const LARGE_THRESHOLD_LAMPORTS = BigInt(1_000_000_000) // 1 SOL

const DISC = {
  initVault: Buffer.from([77,  79,  85,  150, 33,  217, 52,  106]),
  deposit:   Buffer.from([242, 35,  198, 137, 82,  225, 242, 182]),
  withdraw:  Buffer.from([183, 18,  70,  156, 148, 109, 161, 34 ]),
}

type VaultData = { balance: bigint; optIn: boolean }

function findVaultPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    VAULT_PROGRAM_ID
  )
  return pda
}

function parseVaultAccount(raw: Buffer | Uint8Array): VaultData {
  const data = raw instanceof Buffer ? raw : Buffer.from(raw)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let o = 8 + 32             // skip 8-byte discriminator + 32-byte owner pubkey
  const balance = view.getBigUint64(o, true); o += 8
  const optIn   = data[o] === 1
  return { balance, optIn }
}

function buildInitVaultIx(owner: PublicKey, vault: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vault,                   isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISC.initVault,
  })
}

function u64LE(n: bigint): Buffer {
  const buf  = Buffer.allocUnsafe(8)
  const view = new DataView(buf.buffer, buf.byteOffset, 8)
  view.setBigUint64(0, n, true)
  return buf
}

function buildDepositIx(
  owner:    PublicKey,
  vault:    PublicKey,
  registry: PublicKey,
  lamports: bigint
): TransactionInstruction {
  const amountBuf = u64LE(lamports)
  return new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vault,                       isSigner: false, isWritable: true  },
      { pubkey: owner,                       isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
      { pubkey: GUARD_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: registry,                    isSigner: false, isWritable: true  },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,  isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.deposit, amountBuf]),
  })
}

function buildWithdrawIx(
  owner:       PublicKey,
  vault:       PublicKey,
  registry:    PublicKey,
  destination: PublicKey,
  lamports:    bigint
): TransactionInstruction {
  const amountBuf = u64LE(lamports)
  return new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vault,                       isSigner: false, isWritable: true  },
      { pubkey: owner,                       isSigner: true,  isWritable: false },
      { pubkey: destination,                 isSigner: false, isWritable: true  },
      { pubkey: GUARD_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: registry,                    isSigner: false, isWritable: true  },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,  isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.withdraw, amountBuf]),
  })
}

interface Props {
  onTxSuccess: (sig: string, label: string) => void
  onTxError:   (err: unknown, label: string) => void
}

export function VaultPanel({ onTxSuccess, onTxError }: Props) {
  const { connection }                              = useConnection()
  const { publicKey, sendTransaction, signTransaction } = useWallet()
  const { authorizeAndSend }                        = useTrana()

  const [vault,       setVault]       = useState<VaultData | null | "loading">("loading")
  const [depositAmt,  setDepositAmt]  = useState("")
  const [withdrawAmt, setWithdrawAmt] = useState("")
  const [busy,        setBusy]        = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  const refreshVault = useCallback(async () => {
    if (!publicKey) return
    const vaultPda = findVaultPda(publicKey)
    const info = await connection.getAccountInfo(vaultPda)
    setVault(info ? parseVaultAccount(info.data) : null)
  }, [publicKey, connection])

  useEffect(() => { refreshVault() }, [refreshVault])

  async function handleInitVault() {
    if (!publicKey) return
    setBusy("init"); setError(null)
    try {
      const vaultPda = findVaultPda(publicKey)
      const ix = buildInitVaultIx(publicKey, vaultPda)
      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, "confirmed")
      onTxSuccess(sig, "init vault")
      await refreshVault()
    } catch (e: any) {
      setError(e?.message ?? "Failed")
      onTxError(e, "init vault")
    } finally {
      setBusy(null)
    }
  }

  async function handleDeposit() {
    if (!publicKey) return
    const solAmt  = parseFloat(depositAmt)
    if (!solAmt || solAmt <= 0) return
    const lamports = BigInt(Math.round(solAmt * 1e9))
    setBusy("deposit"); setError(null)
    try {
      const vaultPda    = findVaultPda(publicKey)
      const registryPda = findRegistryPda(publicKey, GUARD_PROGRAM_ID)
      const needsPasskey = lamports >= LARGE_THRESHOLD_LAMPORTS
      let sig: string

      if (needsPasskey) {
        const paramBuf = u64LE(lamports)
        sig = await authorizeAndSend({
          buildIntent: () => ({
            targetProgramId:          VAULT_PROGRAM_ID,
            instructionDiscriminator: DISC.deposit,
            accounts: [
              vaultPda,
              publicKey,
              SystemProgram.programId,
              GUARD_PROGRAM_ID,
              registryPda,
              SYSVAR_INSTRUCTIONS_PUBKEY,
            ],
            params:  paramBuf,
            policy:  "transfer.large",
          }),
          buildTransaction: async ({ recentBlockhash }) => {
            const tx = new Transaction({ recentBlockhash, feePayer: publicKey })
            tx.add(buildDepositIx(publicKey, vaultPda, registryPda, lamports))
            return tx
          },
        })
      } else {
        const { blockhash } = await connection.getLatestBlockhash()
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
        tx.add(buildDepositIx(publicKey, vaultPda, registryPda, lamports))
        sig = await sendTransaction(tx, connection)
      }

      await connection.confirmTransaction(sig, "confirmed")
      setDepositAmt("")
      onTxSuccess(sig, `deposit ${solAmt} SOL`)
      await refreshVault()
    } catch (e: any) {
      setError(e?.message ?? "Deposit failed")
      onTxError(e, `deposit ${solAmt} SOL`)
    } finally {
      setBusy(null)
    }
  }

  async function handleWithdraw() {
    if (!publicKey) return
    const solAmt  = parseFloat(withdrawAmt)
    if (!solAmt || solAmt <= 0) return
    const lamports = BigInt(Math.round(solAmt * 1e9))
    setBusy("withdraw"); setError(null)
    try {
      const vaultPda    = findVaultPda(publicKey)
      const registryPda = findRegistryPda(publicKey, GUARD_PROGRAM_ID)
      const destination = publicKey
      const needsPasskey = lamports >= LARGE_THRESHOLD_LAMPORTS
      let sig: string

      if (needsPasskey) {
        const paramBuf = u64LE(lamports)
        sig = await authorizeAndSend({
          buildIntent: () => ({
            targetProgramId:          VAULT_PROGRAM_ID,
            instructionDiscriminator: DISC.withdraw,
            accounts: [
              vaultPda,
              publicKey,
              destination,
              GUARD_PROGRAM_ID,
              registryPda,
              SYSVAR_INSTRUCTIONS_PUBKEY,
            ],
            params:  paramBuf,
            policy:  "transfer.large",
          }),
          buildTransaction: async ({ recentBlockhash }) => {
            const tx = new Transaction({ recentBlockhash, feePayer: publicKey })
            tx.add(buildWithdrawIx(publicKey, vaultPda, registryPda, destination, lamports))
            return tx
          },
        })
      } else {
        const { blockhash } = await connection.getLatestBlockhash()
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
        tx.add(buildWithdrawIx(publicKey, vaultPda, registryPda, destination, lamports))
        sig = await sendTransaction(tx, connection)
      }

      await connection.confirmTransaction(sig, "confirmed")
      setWithdrawAmt("")
      onTxSuccess(sig, `withdraw ${solAmt} SOL`)
      await refreshVault()
    } catch (e: any) {
      setError(e?.message ?? "Withdraw failed")
      onTxError(e, `withdraw ${solAmt} SOL`)
    } finally {
      setBusy(null)
    }
  }

  if (vault === "loading") {
    return (
      <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Vault</h2>
        <p className="text-xs text-gray-600">Loading…</p>
      </section>
    )
  }

  const depositSol  = parseFloat(depositAmt  || "0")
  const withdrawSol = parseFloat(withdrawAmt || "0")

  return (
    <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Vault</h2>
        {vault && (
          <span className="text-sm font-mono text-gray-200">
            {(Number(vault.balance) / 1e9).toFixed(4)} SOL
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 break-all" title={error}>
          {error.length > 120 ? error.slice(0, 120) + "…" : error}
        </p>
      )}

      {vault === null ? (
        /* ── Not initialized ─────────────────────────────────────────── */
        <div className="space-y-2">
          <p className="text-xs text-gray-500">No vault. Initialize one to start the demo.</p>
          <button
            onClick={handleInitVault}
            disabled={busy === "init"}
            className="text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-700/40 disabled:opacity-50 transition-colors"
          >
            {busy === "init" ? "Initializing…" : "Init Vault"}
          </button>
        </div>
      ) : (
        /* ── Initialized ─────────────────────────────────────────────── */
        <div className="space-y-4">

          {/* Deposit */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">Deposit</label>
              {depositSol >= 1 && (
                <span className="text-xs text-yellow-500/80">passkey required</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0.0 SOL"
                value={depositAmt}
                onChange={e => setDepositAmt(e.target.value)}
                disabled={!!busy}
                className="flex-1 text-xs bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-700 disabled:opacity-50"
              />
              <button
                onClick={handleDeposit}
                disabled={!depositAmt || !!busy}
                className="text-xs px-3 py-1.5 rounded border border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {busy === "deposit" ? "…" : depositSol >= 1 ? "Deposit 🔐" : "Deposit"}
              </button>
            </div>
          </div>

          {/* Withdraw */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">Withdraw</label>
              {withdrawSol >= 1 && (
                <span className="text-xs text-yellow-500/80">passkey required</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0.0 SOL"
                value={withdrawAmt}
                onChange={e => setWithdrawAmt(e.target.value)}
                disabled={!!busy}
                className="flex-1 text-xs bg-black/30 border border-gray-700 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-700 disabled:opacity-50"
              />
              <button
                onClick={handleWithdraw}
                disabled={!withdrawAmt || !!busy || vault.balance === 0n}
                className="text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-700/40 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {busy === "withdraw" ? "…" : withdrawSol >= 1 ? "Withdraw 🔐" : "Withdraw"}
              </button>
            </div>
          </div>

          {vault.optIn && (
            <p className="text-xs text-indigo-400/60">
              Opt-in mode active — all transactions require passkey
            </p>
          )}
        </div>
      )}
    </section>
  )
}
