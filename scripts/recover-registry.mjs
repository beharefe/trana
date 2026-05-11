#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Emergency: clear all passkeys and register a fresh one.
// Requires only the owner wallet signature — no passkey proof.
// Use when all registered passkeys are lost/inaccessible.
//
// Usage:
//   ANCHOR_WALLET=<keypair.json> node scripts/recover-registry.mjs \
//     <guard-id> <pubkey-hex> <cred-id-hex>
//
// Get pubkey-hex and cred-id-hex from the browser's "Generate Touch ID
// credential" button on the /try page, then paste them here.

import { readFileSync } from "fs"
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js"

const [,, guardId, pubkeyHex, credIdHex] = process.argv
if (!guardId || !pubkeyHex || !credIdHex) {
  console.error("Usage: ANCHOR_WALLET=<keypair.json> node recover-registry.mjs <guard-id> <pubkey-hex> <cred-id-hex>")
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

if (newPubkeyBytes.length !== 33) {
  console.error(`pubkey must be 33 bytes (compressed P-256), got ${newPubkeyBytes.length}`)
  process.exit(1)
}

const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("passkey"), owner.publicKey.toBuffer()], GUARD_PROG,
)

// Fetch current registry state
const regInfo = await conn.getAccountInfo(registryPda)
const nKeys = regInfo
  ? new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 8+32+8, 4).getUint32(0, true)
  : 0

console.log(`Owner:      ${owner.publicKey.toBase58()}`)
console.log(`Registry:   ${registryPda.toBase58()}`)
console.log(`New pubkey: ${pubkeyHex.slice(0, 16)}…`)
console.log(`New credId: ${credIdHex.slice(0, 16)}…`)
console.log(`Keys before recovery: ${nKeys}`)
console.log()

// sha256("global:recover_registry")[0..8]
const RECOVER_DISC = Buffer.from([136, 166, 31, 45, 33, 116, 115, 12])

const u32le      = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
const borshBytes = b => Buffer.concat([u32le(b.length), Buffer.from(b)])
const recoverData = Buffer.concat([RECOVER_DISC, Buffer.from([0]), borshBytes(newPubkeyBytes), borshBytes(newCredId)])

const recoverIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [
    { pubkey: registryPda,   isSigner: false, isWritable: true },
    { pubkey: owner.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: recoverData,
})

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(recoverIx)
tx.sign(owner)

console.log("Recovering registry (clearing all keys, adding new credential)…")
const sig    = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) { console.error("Failed:", JSON.stringify(result.value.err)); process.exit(1) }

console.log(`✓ Registry recovered: ${sig}`)
console.log(`  Registry now has 1 passkey: ${pubkeyHex.slice(0, 16)}…`)
console.log()
console.log("Next: the browser will use Touch ID directly for this wallet.")
console.log("If you also removed the CLI key, you're done.")
console.log("To add more credentials: use the browser /try → Manage passkeys → Add passkey")
