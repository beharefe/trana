#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Add a passkey to an existing registry using the CLI-derived P-256 key as proof.
// Use this when your registry was created by register-passkey.mjs (shows QR in browser).
//
// Flow:
//   1. In browser: Manage passkeys → "Generate Touch ID credential" → copy the command shown
//   2. Run that command (this script) — it adds the new Touch ID credential on-chain
//   3. In browser: Manage passkeys → "Remove old CLI key" → removes the synthetic credential
//   4. Done — browser now shows Touch ID directly
//
// Usage:
//   ANCHOR_WALLET=<keypair.json> node scripts/add-passkey.mjs <guard-id> <pubkey-hex> <cred-id-hex>

import { readFileSync } from "fs"
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js"
import { createHash } from "crypto"
import { p256 } from "@noble/curves/nist.js"

const [,, guardId, pubkeyHex, credIdHex] = process.argv
if (!guardId || !pubkeyHex || !credIdHex) {
  console.error("Usage: ANCHOR_WALLET=<keypair.json> node add-passkey.mjs <guard-id> <pubkey-hex> <cred-id-hex>")
  process.exit(1)
}

const RPC    = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com"
const WALLET = process.env.ANCHOR_WALLET
if (!WALLET) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const conn   = new Connection(RPC, "confirmed")
const secret = JSON.parse(readFileSync(WALLET, "utf8"))
const owner  = Keypair.fromSecretKey(Uint8Array.from(secret))

const GUARD_PROG     = new PublicKey(guardId)
const newPubkeyBytes = Buffer.from(pubkeyHex, "hex")
const newCredId      = Buffer.from(credIdHex, "hex")

const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("passkey"), owner.publicKey.toBuffer()], GUARD_PROG,
)
const regInfo = await conn.getAccountInfo(registryPda)
if (!regInfo) { console.error("No registry found — run register-passkey.mjs first"); process.exit(1) }
const nonce = new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 40, 8).getBigUint64(0, true)

// Fetch treasury from config
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], GUARD_PROG)
const configInfo  = await conn.getAccountInfo(configPda)
if (!configInfo) { console.error("Guard config not initialized"); process.exit(1) }
const treasury = new PublicKey(configInfo.data.slice(40, 72))

console.log(`Owner:        ${owner.publicKey.toBase58()}`)
console.log(`Registry:     ${registryPda.toBase58()}`)
console.log(`New pubkey:   ${pubkeyHex.slice(0, 16)}…`)
console.log(`New cred ID:  ${credIdHex.slice(0, 16)}…`)
console.log(`Nonce:        ${nonce}`)
console.log()

// ── Build add_passkey instruction ─────────────────────────────────────────────

const ADD_DISC    = Buffer.from([173, 230, 84, 153, 54, 144, 214, 37])
const SYSVAR_IX   = new PublicKey("Sysvar1nstructions1111111111111111111111111")
const { SystemProgram } = await import("@solana/web3.js")

const u32le      = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
const borshBytes = b => Buffer.concat([u32le(b.length), Buffer.from(b)])
const addData    = Buffer.concat([ADD_DISC, Buffer.from([0]), borshBytes(newPubkeyBytes), borshBytes(newCredId)])

const addPasskeyIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [
    { pubkey: registryPda,                 isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey,             isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
    { pubkey: configPda,                   isSigner: false, isWritable: false },
    { pubkey: treasury,                    isSigner: false, isWritable: true  },
    { pubkey: SYSVAR_IX,                   isSigner: false, isWritable: false },
  ],
  data: addData,
})

// ── Build proof using existing CLI-derived P-256 key ──────────────────────────

const seed        = createHash("sha256").update("trana:passkey:v1").update(owner.secretKey.slice(0, 32)).digest()
const privKeyBig = seed
const pubkeyBytes = p256.getPublicKey(privKeyBig, true)

// Compute accounts_hash and params_hash from the actual protected instruction
const ixAccsBytes = Buffer.concat([
  registryPda.toBuffer(), owner.publicKey.toBuffer(),
  SystemProgram.programId.toBuffer(), configPda.toBuffer(),
  treasury.toBuffer(), SYSVAR_IX.toBuffer(),
])
const accountsHash = createHash("sha256").update(ixAccsBytes).digest()
const paramsHash   = createHash("sha256").update(addData.slice(8)).digest()

const u16le     = n => { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n); return b }
const enc       = new TextEncoder()
const domain    = enc.encode("trana:v1")
const policy    = enc.encode("trana.require")
const nonceBuf  = Buffer.allocUnsafe(8); new DataView(nonceBuf.buffer, nonceBuf.byteOffset, 8).setBigUint64(0, nonce, true)
const expiryUnix = Math.floor(Date.now() / 1000) + 120
const expiryBuf = Buffer.allocUnsafe(8); new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)

const payload = Buffer.concat([
  Buffer.from([1]),
  u16le(domain.length), Buffer.from(domain),
  owner.publicKey.toBuffer(),
  GUARD_PROG.toBuffer(),
  GUARD_PROG.toBuffer(),
  u16le(policy.length), Buffer.from(policy),
  ADD_DISC,
  accountsHash, paramsHash,
  nonceBuf, expiryBuf,
])
const challenge  = createHash("sha256").update(payload).digest()
const rpIdHash   = createHash("sha256").update("localhost").digest()
const authData   = Buffer.concat([rpIdHash, Buffer.from([0x05, 0, 0, 0, 0])])
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

const RECORD_DISC  = Buffer.from(createHash("sha256").update("global:record_proof").digest()).slice(0, 8)
const borshStr     = s => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
const expBuf2      = Buffer.allocUnsafe(8); new DataView(expBuf2.buffer, expBuf2.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)
const recordData   = Buffer.concat([RECORD_DISC, Buffer.from([1]), expBuf2, borshStr("trana.require"), borshBytes(authData), borshBytes(clientJSON)])
const recordProofIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [{ pubkey: SYSVAR_IX, isSigner: false, isWritable: false }],
  data: recordData,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(secp256r1Ix, recordProofIx, addPasskeyIx)
tx.sign(owner)

console.log("Adding new passkey to registry...")
const sig    = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) { console.error("Failed:", JSON.stringify(result.value.err)); process.exit(1) }

console.log(`✓ New Touch ID credential added: ${sig}`)
console.log()
console.log("Next: remove the old CLI credential from the browser UI")
console.log("  → Manage passkeys → Remove old CLI key")
console.log("  OR run: node scripts/remove-passkey.mjs <guard-id> <old-cred-id-hex>")
