#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Upgrade a program whose upgrade authority is a Trana Authority PDA.
// Requires a passkey proof — the wallet key alone is not enough.
//
// Flow:
//   1. Build the new binary:         cargo build-sbf --manifest-path programs/<name>/Cargo.toml
//   2. Write a buffer on-chain:       solana program write-buffer target/deploy/<name>.so
//   3. Run this script to upgrade:    node scripts/upgrade-program.mjs ...
//
// The script:
//   a. Derives the AuthorityRecord PDA
//   b. Signs an intent hash with a P-256 key (from keypair seed — not Touch ID)
//   c. Sends [secp256r1Ix, recordProofIx, executeUpgradeIx]
//
// Usage:
//   ANCHOR_WALLET=<keypair.json> \
//   node scripts/upgrade-program.mjs \
//     <authority-program-id> \
//     <guard-program-id> \
//     <target-program-id> \
//     <buffer-address>
//
// Example:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   node scripts/upgrade-program.mjs \
//     TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN \
//     TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG \
//     8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa \
//     <buffer-pubkey>

import { readFileSync } from "fs"
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from "@solana/web3.js"
import { createHash } from "crypto"
import { p256 } from "@noble/curves/nist.js"

const [,, authorityId, guardId, targetId, bufferAddr] = process.argv
if (!authorityId || !guardId || !targetId || !bufferAddr) {
  console.error("Usage: node upgrade-program.mjs <authority-id> <guard-id> <target-id> <buffer>")
  process.exit(1)
}

const RPC      = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com"
const WALLET   = process.env.ANCHOR_WALLET
if (!WALLET) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const conn     = new Connection(RPC, "confirmed")
const secret   = JSON.parse(readFileSync(WALLET, "utf8"))
const owner    = Keypair.fromSecretKey(Uint8Array.from(secret))

const AUTHORITY_PROG = new PublicKey(authorityId)
const GUARD_PROG     = new PublicKey(guardId)
const TARGET         = new PublicKey(targetId)
const BUFFER         = new PublicKey(bufferAddr)

// ── Derive accounts ───────────────────────────────────────────────────────────

const [recordPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.publicKey.toBuffer(), TARGET.toBuffer()],
  AUTHORITY_PROG,
)

// Get programData address from program account
const progInfo = await conn.getAccountInfo(TARGET)
if (!progInfo) { console.error("program not found"); process.exit(1) }
const programData = new PublicKey(progInfo.data.slice(4, 36))

// Get registry nonce
const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("passkey"), owner.publicKey.toBuffer()],
  GUARD_PROG,
)
const regInfo = await conn.getAccountInfo(registryPda)
if (!regInfo) { console.error("no passkey registry — run register-passkey.mjs first"); process.exit(1) }
const nonce = new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 40, 8).getBigUint64(0, true)

console.log(`Owner:       ${owner.publicKey.toBase58()}`)
console.log(`Target:      ${TARGET.toBase58()}`)
console.log(`ProgramData: ${programData.toBase58()}`)
console.log(`Buffer:      ${BUFFER.toBase58()}`)
console.log(`Record PDA:  ${recordPda.toBase58()}`)
console.log(`Nonce:       ${nonce}`)
console.log()

// ── Build execute_upgrade instruction ─────────────────────────────────────────

// sha256("global:execute_upgrade")[0..8]
const EXEC_DISC = Buffer.from(
  createHash("sha256").update("global:execute_upgrade").digest()
).slice(0, 8)

const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
const SYSVAR_CLOCK    = new PublicKey("SysvarC1ock11111111111111111111111111111111")
const SYSVAR_RENT     = new PublicKey("SysvarRent111111111111111111111111111111111")
const SYSVAR_IX       = new PublicKey("Sysvar1nstructions1111111111111111111111111")

const executeUpgradeIx = new TransactionInstruction({
  programId: AUTHORITY_PROG,
  keys: [
    { pubkey: recordPda,            isSigner: false, isWritable: false },
    { pubkey: owner.publicKey,      isSigner: true,  isWritable: false },
    { pubkey: TARGET,               isSigner: false, isWritable: true  },
    { pubkey: programData,          isSigner: false, isWritable: true  },
    { pubkey: BUFFER,               isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey,      isSigner: false, isWritable: true  }, // spill
    { pubkey: SYSVAR_RENT,          isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK,         isSigner: false, isWritable: false },
    { pubkey: GUARD_PROG,           isSigner: false, isWritable: false },
    { pubkey: registryPda,          isSigner: false, isWritable: true  },
    { pubkey: SYSVAR_IX,            isSigner: false, isWritable: false },
    { pubkey: BPF_UPGRADEABLE,      isSigner: false, isWritable: false },
  ],
  data: EXEC_DISC,
})

// ── Build passkey proof ───────────────────────────────────────────────────────

// Derive P-256 key from keypair seed (same as register-passkey.mjs)
const seed       = createHash("sha256").update("trana:passkey:v1").update(owner.secretKey.slice(0, 32)).digest()
const privKeyBig = seed
const pubkeyBytes = p256.getPublicKey(privKeyBig, true)


// Build intent
const intentFields = {
  version:                  1,
  domain:                   "trana:v1",
  wallet:                   owner.publicKey.toBase58(),
  tranaGuardProgramId:      GUARD_PROG.toBase58(),
  targetProgramId:          AUTHORITY_PROG.toBase58(),
  policyId:                 "trana.require",
  instructionDiscriminator: Buffer.from(EXEC_DISC).toString("hex"),
  nonce:                    nonce.toString(10),
  expiryUnix:               Math.floor(Date.now() / 1000) + 120,
}

// Compute accounts_hash and params_hash from the actual protected instruction
const ixAccsBytes = Buffer.concat([
  recordPda.toBuffer(), owner.publicKey.toBuffer(), TARGET.toBuffer(),
  programData.toBuffer(), BUFFER.toBuffer(), owner.publicKey.toBuffer(),
  SYSVAR_RENT.toBuffer(), SYSVAR_CLOCK.toBuffer(), GUARD_PROG.toBuffer(),
  registryPda.toBuffer(), SYSVAR_IX.toBuffer(), BPF_UPGRADEABLE.toBuffer(),
])
const accountsHash = createHash("sha256").update(ixAccsBytes).digest()
const paramsHash   = createHash("sha256").update(Buffer.alloc(0)).digest() // no params after disc

const enc    = new TextEncoder()
const domain = enc.encode(intentFields.domain)
const policy = enc.encode(intentFields.policyId)
const u16le  = n => { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n); return b }
const nonceBuf  = Buffer.allocUnsafe(8); new DataView(nonceBuf.buffer, nonceBuf.byteOffset, 8).setBigUint64(0, nonce, true)
const expiryBuf = Buffer.allocUnsafe(8); new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(intentFields.expiryUnix), true)

const payload = Buffer.concat([
  Buffer.from([1]),
  u16le(domain.length), Buffer.from(domain),
  owner.publicKey.toBuffer(),
  GUARD_PROG.toBuffer(),
  AUTHORITY_PROG.toBuffer(),
  u16le(policy.length), Buffer.from(policy),
  EXEC_DISC,
  accountsHash,
  paramsHash,
  nonceBuf,
  expiryBuf,
])
const challenge = createHash("sha256").update(payload).digest()

// WebAuthn-style: authenticatorData (37 bytes) + SHA-256(clientDataJSON)
const rpIdHash   = createHash("sha256").update("localhost").digest()
const authData   = Buffer.concat([rpIdHash, Buffer.from([0x05, 0, 0, 0, 0])])
const clientJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: challenge.toString("base64url") }))
const clientHash = createHash("sha256").update(clientJSON).digest()
const message = Buffer.concat([authData, clientHash])
const compact = p256.sign(message, privKeyBig, { lowS: true })

// Build secp256r1 instruction
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
  keys: [],
  data: secp256r1Data,
})

// Build record_proof instruction
const RECORD_DISC = Buffer.from(createHash("sha256").update("global:record_proof").digest()).slice(0, 8)
const u32le       = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
const borshBytes  = b => Buffer.concat([u32le(b.length), Buffer.from(b)])
const borshStr    = s => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
const expBuf      = Buffer.allocUnsafe(8); new DataView(expBuf.buffer, expBuf.byteOffset, 8).setBigInt64(0, BigInt(intentFields.expiryUnix), true)
const recordData  = Buffer.concat([RECORD_DISC, Buffer.from([1]), expBuf, borshStr("trana.require"), borshBytes(authData), borshBytes(clientJSON)])

const recordProofIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [{ pubkey: SYSVAR_IX, isSigner: false, isWritable: false }],
  data: recordData,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(secp256r1Ix, recordProofIx, executeUpgradeIx)
tx.sign(owner)

console.log("Sending upgrade transaction...")
const sig    = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) {
  console.error("Upgrade failed:", result.value.err)
  process.exit(1)
}

console.log(`✓ Upgraded: ${sig}`)
console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`)
