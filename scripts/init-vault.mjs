#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Initialize a trana_test_vault pool.
// Must be run once after the vault program is deployed.
//
// Usage:
//   node scripts/init-vault.mjs <vault-program-id> [options]
//
// Options:
//   --kind   limit|time-locked   Pool policy (default: limit)
//   --label  <string>            Display label, max 32 chars (default: "Demo Vault")
//
// Env:
//   ANCHOR_PROVIDER_URL    RPC endpoint (default: http://localhost:8899)
//   ANCHOR_WALLET          Path to authority keypair JSON (required)

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { readFileSync } from "fs"

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const positional = args.filter(a => !a.startsWith("--"))
const flags = {}
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    flags[args[i].slice(2)] = args[i + 1]
    i++
  }
}

const [vaultProgramId] = positional
if (!vaultProgramId) {
  console.error("Usage: init-vault.mjs <vault-program-id> [--kind limit|time-locked] [--label <string>]")
  process.exit(1)
}

const kindArg = flags["kind"] ?? "limit"
if (kindArg !== "limit" && kindArg !== "time-locked") {
  console.error(`--kind must be "limit" or "time-locked", got: ${kindArg}`)
  process.exit(1)
}
// PoolKind borsh layout: single discriminant byte (0 = Limit, 1 = TimeLocked)
const poolKindByte = kindArg === "limit" ? 0 : 1

const label = flags["label"] ?? "Demo Vault"
if (label.length > 32) {
  console.error(`--label max 32 characters, got ${label.length}`)
  process.exit(1)
}

// ── Connect ───────────────────────────────────────────────────────────────────

const rpc        = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899"
const walletPath = process.env.ANCHOR_WALLET
if (!walletPath) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const connection = new Connection(rpc, "confirmed")
const secret     = JSON.parse(readFileSync(walletPath, "utf8"))
const authority  = Keypair.fromSecretKey(Uint8Array.from(secret))

let programId
try { programId = new PublicKey(vaultProgramId) }
catch { console.error(`Invalid program ID: ${vaultProgramId}`); process.exit(1) }

// ── Check if already initialized ─────────────────────────────────────────────

const [poolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-pool"), authority.publicKey.toBuffer()],
  programId,
)
const existing = await connection.getAccountInfo(poolPda)
if (existing) {
  console.log(`pool already initialized`)
  console.log(`  pda:      ${poolPda.toBase58()}`)
  console.log(`  program:  ${programId.toBase58()}`)
  process.exit(0)
}

// ── Show params before sending ────────────────────────────────────────────────

console.log("initialize_pool")
console.log(`  program:    ${programId.toBase58()}`)
console.log(`  pool PDA:   ${poolPda.toBase58()}`)
console.log(`  authority:  ${authority.publicKey.toBase58()}`)
console.log(`  kind:       ${kindArg}`)
console.log(`  label:      "${label}"`)
console.log(`  cluster:    ${rpc}`)
console.log()

// ── Build instruction ─────────────────────────────────────────────────────────

// sha256("global:initialize_pool")[0..8]
const disc = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40])

// PoolKind: 1-byte variant discriminant (Anchor borsh enum, no payload for either variant)
const kindBuf = Buffer.from([poolKindByte])

// String encoding: 4-byte LE length prefix + UTF-8 bytes (Anchor/borsh convention)
const labelBytes  = Buffer.from(label, "utf8")
const labelLenBuf = Buffer.alloc(4)
labelLenBuf.writeUInt32LE(labelBytes.length)
const labelBuf = Buffer.concat([labelLenBuf, labelBytes])

const data = Buffer.concat([disc, kindBuf, labelBuf])

const ix = new TransactionInstruction({
  programId,
  keys: [
    { pubkey: poolPda,               isSigner: false, isWritable: true  },
    { pubkey: authority.publicKey,   isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: authority.publicKey })
tx.add(ix)
tx.sign(authority)

const sig = await connection.sendRawTransaction(tx.serialize())
await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
console.log(`initialize_pool ok`)
console.log(`  pool: ${poolPda.toBase58()}`)
console.log(`  sig:  ${sig}`)
