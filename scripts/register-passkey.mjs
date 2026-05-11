#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Usage:
//   node scripts/register-passkey.mjs <trana-guard-program-id> <keypair.json>
//
// Env:
//   ANCHOR_PROVIDER_URL  RPC endpoint (default: http://localhost:8899)

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { createHash } from "crypto"
import { readFileSync } from "fs"

const [guardId, keypairPath] = process.argv.slice(2)
if (!guardId || !keypairPath) {
  console.error("Usage: register-passkey.mjs <trana-guard-program-id> <keypair.json>")
  process.exit(1)
}

const { p256 } = await import("@noble/curves/nist.js")

const rpc            = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899"
const connection     = new Connection(rpc, "confirmed")
const owner          = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))))
const guardProgramId = new PublicKey(guardId)

const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("passkey"), owner.publicKey.toBuffer()], guardProgramId)
const [configPda]   = PublicKey.findProgramAddressSync([Buffer.from("config")], guardProgramId)

// Read treasury from the on-chain config (offset: 8 disc + 32 authority = 40)
const configInfo = await connection.getAccountInfo(configPda)
if (!configInfo) { console.error("Guard config not initialized — run init-config.mjs first"); process.exit(1) }
const treasuryPubkey = new PublicKey(configInfo.data.slice(40, 72))
console.log(`  treasury (from config): ${treasuryPubkey.toBase58()}`)

const existing = await connection.getAccountInfo(registryPda)
if (existing) {
  console.log(`Registry already exists: ${registryPda.toBase58()}`)
  process.exit(0)
}

// Derive P-256 key deterministically from the wallet keypair
const seed         = createHash("sha256").update("trana:passkey:v1").update(owner.secretKey.slice(0, 32)).digest()
const pubkeyBytes  = p256.getPublicKey(seed, true)   // seed is 32 bytes — valid scalar
const credentialId = createHash("sha256").update("trana:credid:v1").update(owner.publicKey.toBuffer()).digest().slice(0, 16)

// sha256("global:register_passkey")[0..8]
const disc = Buffer.from([16, 2, 121, 116, 194, 17, 247, 233])

function borshBytes(b) {
  const len = Buffer.alloc(4); len.writeUInt32LE(b.length)
  return Buffer.concat([len, Buffer.from(b)])
}

// KeyKind::Secp256r1Passkey = variant 0
const data = Buffer.concat([disc, Buffer.from([0]), borshBytes(pubkeyBytes), borshBytes(credentialId)])

const ix = new TransactionInstruction({
  programId: guardProgramId,
  keys: [
    { pubkey: registryPda,             isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey,         isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: configPda,               isSigner: false, isWritable: false },
    { pubkey: treasuryPubkey,          isSigner: false, isWritable: true  },
  ],
  data,
})

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(ix)
tx.sign(owner)

const sig = await connection.sendRawTransaction(tx.serialize())
await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")

console.log(`register_passkey ok`)
console.log(`  registry: ${registryPda.toBase58()}`)
console.log(`  owner:    ${owner.publicKey.toBase58()}`)
console.log(`  sig:      ${sig}`)
