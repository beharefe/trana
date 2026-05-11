#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Reclaim a program's upgrade authority from a Trana Authority PDA back to
// a plain wallet (or any new address). Requires passkey proof from the current owner.
//
// Usage:
//   ANCHOR_WALLET=<current-owner-keypair.json> \
//   node scripts/reclaim-authority.mjs \
//     <authority-program-id> \
//     <guard-program-id> \
//     <target-program-id> \
//     <new-authority-address>
//
// Example — hand authority to a fresh wallet:
//   ANCHOR_WALLET=~/.config/solana/prefix1.json \
//   node scripts/reclaim-authority.mjs \
//     TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN \
//     TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG \
//     8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa \
//     69btYpyfWs8QMr9V3ntrmqXXKF2L1UUbodDsNAnkVYfy

import { readFileSync } from "fs"
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js"
import { createHash } from "crypto"
import { p256 } from "@noble/curves/nist.js"

const [,, authorityId, guardId, targetId, newAuthority] = process.argv
if (!authorityId || !guardId || !targetId || !newAuthority) {
  console.error("Usage: node reclaim-authority.mjs <authority-id> <guard-id> <target-id> <new-authority>")
  process.exit(1)
}

const RPC    = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com"
const WALLET = process.env.ANCHOR_WALLET
if (!WALLET) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const conn   = new Connection(RPC, "confirmed")
const secret = JSON.parse(readFileSync(WALLET, "utf8"))
const owner  = Keypair.fromSecretKey(Uint8Array.from(secret))

const AUTHORITY_PROG = new PublicKey(authorityId)
const GUARD_PROG     = new PublicKey(guardId)
const TARGET         = new PublicKey(targetId)
const NEW_AUTHORITY  = new PublicKey(newAuthority)

// ── Derive accounts ───────────────────────────────────────────────────────────

const [recordPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.publicKey.toBuffer(), TARGET.toBuffer()],
  AUTHORITY_PROG,
)

const progInfo = await conn.getAccountInfo(TARGET)
if (!progInfo) { console.error("program not found"); process.exit(1) }
const programData = new PublicKey(progInfo.data.slice(4, 36))

const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("passkey"), owner.publicKey.toBuffer()],
  GUARD_PROG,
)
const regInfo = await conn.getAccountInfo(registryPda)
if (!regInfo) { console.error("no passkey registry — run register-passkey.mjs first"); process.exit(1) }
const nonce = new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 40, 8).getBigUint64(0, true)

console.log(`Current owner: ${owner.publicKey.toBase58()}`)
console.log(`Target:        ${TARGET.toBase58()}`)
console.log(`Record PDA:    ${recordPda.toBase58()}`)
console.log(`New authority: ${NEW_AUTHORITY.toBase58()}`)
console.log(`Nonce:         ${nonce}`)
console.log()

// ── Build reclaim_authority instruction ───────────────────────────────────────

// sha256("global:reclaim_authority")[0..8]
const RECLAIM_DISC = Buffer.from([156, 147, 67, 113, 251, 229, 162, 166])

const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
const SYSVAR_IX       = new PublicKey("Sysvar1nstructions1111111111111111111111111")

// reclaim_authority(new_authority: Pubkey) — 8 disc + 32 pubkey
const reclaimData = Buffer.concat([RECLAIM_DISC, NEW_AUTHORITY.toBuffer()])

const reclaimIx = new TransactionInstruction({
  programId: AUTHORITY_PROG,
  keys: [
    { pubkey: recordPda,         isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey,   isSigner: true,  isWritable: true  }, // receives rent
    { pubkey: TARGET,            isSigner: false, isWritable: false },
    { pubkey: programData,       isSigner: false, isWritable: true  },
    { pubkey: NEW_AUTHORITY,     isSigner: false, isWritable: false },
    { pubkey: GUARD_PROG,        isSigner: false, isWritable: false },
    { pubkey: registryPda,       isSigner: false, isWritable: true  },
    { pubkey: SYSVAR_IX,         isSigner: false, isWritable: false },
    { pubkey: BPF_UPGRADEABLE,   isSigner: false, isWritable: false },
  ],
  data: reclaimData,
})

// ── Build passkey proof ───────────────────────────────────────────────────────

const seed       = createHash("sha256").update("trana:passkey:v1").update(owner.secretKey.slice(0, 32)).digest()
const privKeyBig = seed
const pubkeyBytes = p256.getPublicKey(privKeyBig, true)


// Compute accounts_hash and params_hash from the actual protected instruction
const ixAccsBytes = Buffer.concat([
  recordPda.toBuffer(), owner.publicKey.toBuffer(), TARGET.toBuffer(),
  programData.toBuffer(), NEW_AUTHORITY.toBuffer(), GUARD_PROG.toBuffer(),
  registryPda.toBuffer(), SYSVAR_IX.toBuffer(), BPF_UPGRADEABLE.toBuffer(),
])
const accountsHash = createHash("sha256").update(ixAccsBytes).digest()
const paramsHash   = createHash("sha256").update(reclaimData.slice(8)).digest()

const u16le  = n => { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n); return b }
const enc    = new TextEncoder()
const domain = enc.encode("trana:v1")
const policy = enc.encode("trana.require")
const nonceBuf  = Buffer.allocUnsafe(8); new DataView(nonceBuf.buffer, nonceBuf.byteOffset, 8).setBigUint64(0, nonce, true)
const expiryUnix = Math.floor(Date.now() / 1000) + 120
const expiryBuf = Buffer.allocUnsafe(8); new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)

const payload = Buffer.concat([
  Buffer.from([1]),
  u16le(domain.length), Buffer.from(domain),
  owner.publicKey.toBuffer(),
  GUARD_PROG.toBuffer(),
  AUTHORITY_PROG.toBuffer(),
  u16le(policy.length), Buffer.from(policy),
  RECLAIM_DISC,
  accountsHash, paramsHash,
  nonceBuf, expiryBuf,
])
const challenge = createHash("sha256").update(payload).digest()

const rpIdHash  = createHash("sha256").update("localhost").digest()
const authData  = Buffer.concat([rpIdHash, Buffer.from([0x05, 0, 0, 0, 0])])
const clientJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: challenge.toString("base64url") }))
const clientHash = createHash("sha256").update(clientJSON).digest()
const message = Buffer.concat([authData, clientHash])
const compact = p256.sign(message, privKeyBig, { lowS: true })

const pubkeyOff = 16, sigOff = 49, msgOff = 113
const secp256r1Data = Buffer.allocUnsafe(msgOff + message.length)
secp256r1Data[0] = 1; secp256r1Data[1] = 0
const sdv = new DataView(secp256r1Data.buffer, secp256r1Data.byteOffset, secp256r1Data.byteLength)
sdv.setUint16(2, sigOff, true); sdv.setUint16(4, 0xffff, true)
sdv.setUint16(6, pubkeyOff, true); sdv.setUint16(8, 0xffff, true)
sdv.setUint16(10, msgOff, true); sdv.setUint16(12, message.length, true)
sdv.setUint16(14, 0xffff, true)
secp256r1Data.set(pubkeyBytes, pubkeyOff)
secp256r1Data.set(compact, sigOff)
secp256r1Data.set(message, msgOff)

const secp256r1Ix = new TransactionInstruction({
  programId: new PublicKey("Secp256r1SigVerify1111111111111111111111111"),
  keys: [], data: secp256r1Data,
})

const RECORD_DISC = Buffer.from(createHash("sha256").update("global:record_proof").digest()).slice(0, 8)
const u32le       = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
const borshBytes  = b => Buffer.concat([u32le(b.length), Buffer.from(b)])
const borshStr    = s => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
const expBuf2     = Buffer.allocUnsafe(8); new DataView(expBuf2.buffer, expBuf2.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)
const recordData  = Buffer.concat([RECORD_DISC, Buffer.from([1]), expBuf2, borshStr("trana.require"), borshBytes(authData), borshBytes(clientJSON)])

const recordProofIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [{ pubkey: SYSVAR_IX, isSigner: false, isWritable: false }],
  data: recordData,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(secp256r1Ix, recordProofIx, reclaimIx)
tx.sign(owner)

console.log("Sending reclaim transaction...")
const sig    = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) { console.error("Failed:", result.value.err); process.exit(1) }

console.log(`✓ Authority reclaimed: ${sig}`)
console.log(`  Upgrade authority is now: ${NEW_AUTHORITY.toBase58()}`)
console.log()
console.log("Next steps:")
console.log(`  1. Register passkey for new wallet in /try page (or run register-passkey.mjs)`)
console.log(`  2. Run secure-upgrade-authority.mjs with the new wallet keypair`)
