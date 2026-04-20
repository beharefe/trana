"use client"

import { useEffect, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { PublicKey, SystemProgram, TransactionInstruction, Transaction } from "@solana/web3.js"
import { doRegistration, fetchRegistry, findRegistryPda } from "@trana-guard/sdk"

const GUARD_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID || "572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6"
)

// register_two_fa discriminator from IDL
const REGISTER_DISCRIMINATOR = Buffer.from([208, 119, 132, 246, 251, 236, 119, 54])

function buildRegisterIx(
  owner:        PublicKey,
  registry:     PublicKey,
  pubkey:       Uint8Array,
  credentialId: Uint8Array,
): TransactionInstruction {
  // Borsh encoding: discriminator + key_kind(u8=0) + pubkey(vec<u8>) + credentialId(vec<u8>)
  const buf = Buffer.alloc(8 + 1 + 4 + pubkey.length + 4 + credentialId.length)
  let o = 0
  REGISTER_DISCRIMINATOR.copy(buf, o);          o += 8
  buf[o] = 0;                                   o += 1   // KeyKind::Secp256r1Passkey = 0
  buf.writeUInt32LE(pubkey.length, o);          o += 4
  Buffer.from(pubkey).copy(buf, o);             o += pubkey.length
  buf.writeUInt32LE(credentialId.length, o);    o += 4
  Buffer.from(credentialId).copy(buf, o)

  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    keys: [
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: owner,    isSigner: true,  isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: buf,
  })
}

interface Props {
  wallet:    string
  serverUrl: string
}

export function PasskeyStatus({ wallet }: Props) {
  const { connection }                   = useConnection()
  const { publicKey, sendTransaction }   = useWallet()

  const [registered, setRegistered] = useState<boolean | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    if (!publicKey) return
    setRegistered(null)
    console.log("[PasskeyStatus] rpc:", connection.rpcEndpoint, "guard:", GUARD_PROGRAM_ID.toBase58())
    fetchRegistry(connection, publicKey, GUARD_PROGRAM_ID)
      .then((r) => {
        console.log("[PasskeyStatus] registry:", r)
        setRegistered(r !== null && r.enabled)
      })
      .catch((e) => {
        console.error("[PasskeyStatus] fetchRegistry error:", e)
        setRegistered(false)
      })
  }, [connection, publicKey])

  async function handleRegister() {
    if (!publicKey) return
    setLoading(true)
    setError(null)
    try {
      const { pubkey, credentialId } = await doRegistration()

      const registry = findRegistryPda(publicKey, GUARD_PROGRAM_ID)
      const ix       = buildRegisterIx(publicKey, registry, pubkey, credentialId)

      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(ix)

      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, "confirmed")

      setRegistered(true)
    } catch (e: any) {
      setError(e?.message ?? "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  if (registered === null) return null

  if (!registered) {
    return (
      <div className="flex items-center gap-2">
        {error && (
          <span className="text-xs text-red-400 max-w-[200px] truncate" title={error}>
            {error}
          </span>
        )}
        <button
          onClick={handleRegister}
          disabled={loading}
          className="text-xs px-3 py-1 rounded border border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Registering…" : "Register Passkey"}
        </button>
      </div>
    )
  }

  return (
    <span className="text-xs px-2 py-0.5 rounded border border-green-800 bg-green-950/40 text-green-400 font-medium">
      passkey registered ✓
    </span>
  )
}
