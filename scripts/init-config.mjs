#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// One-time initialization of the trana_guard global fee config PDA.
// Must be run once after the program is first deployed.
//
// Usage:
//   node scripts/init-config.mjs <trana-guard-program-id> <treasury-address> [options]
//
// Options:
//   --register-fee <sol>   Fee charged for passkey registration (default: 0.005)
//   --add-key-fee  <sol>   Fee charged for adding a passkey key (default: 0.01)
//
// Env:
//   ANCHOR_PROVIDER_URL    RPC endpoint (default: http://localhost:8899)
//   ANCHOR_WALLET          Path to payer keypair JSON (required)

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

const [tranaGuardId, treasury] = positional
if (!tranaGuardId || !treasury) {
  console.error("Usage: init-config.mjs <trana-guard-program-id> <treasury-address> [--register-fee <sol>] [--recovery-fee <sol>]")
  process.exit(1)
}

const SOL = 1_000_000_000n
const parseSol = (val, defaultSol) => {
  if (!val) return BigInt(Math.round(defaultSol * 1e9))
  const f = parseFloat(val)
  if (isNaN(f) || f < 0) { console.error(`Invalid SOL value: ${val}`); process.exit(1) }
  return BigInt(Math.round(f * 1e9))
}

const registerFeeLamports = parseSol(flags["register-fee"], 0.005)
const addKeyFeeLamports   = parseSol(flags["add-key-fee"],   0.01)

// ── Connect ───────────────────────────────────────────────────────────────────

const rpc        = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899"
const walletPath = process.env.ANCHOR_WALLET
if (!walletPath) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const connection = new Connection(rpc, "confirmed")
const secret     = JSON.parse(readFileSync(walletPath, "utf8"))
const payer      = Keypair.fromSecretKey(Uint8Array.from(secret))

let tranaGuardProgramId, treasuryPubkey
try { tranaGuardProgramId = new PublicKey(tranaGuardId) }
catch { console.error(`Invalid program ID: ${tranaGuardId}`); process.exit(1) }
try { treasuryPubkey = new PublicKey(treasury) }
catch { console.error(`Invalid treasury address: ${treasury}`); process.exit(1) }

// ── Check if already initialized ─────────────────────────────────────────────

const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], tranaGuardProgramId)
const existing = await connection.getAccountInfo(configPda)
if (existing) {
  console.log(`config PDA already initialized`)
  console.log(`  pda:      ${configPda.toBase58()}`)
  console.log(`  program:  ${tranaGuardProgramId.toBase58()}`)
  process.exit(0)
}

// ── Show params before sending ────────────────────────────────────────────────

console.log("init_config")
console.log(`  program:       ${tranaGuardProgramId.toBase58()}`)
console.log(`  config PDA:    ${configPda.toBase58()}`)
console.log(`  authority:     ${payer.publicKey.toBase58()}`)
console.log(`  treasury:      ${treasuryPubkey.toBase58()}`)
console.log(`  register_fee:  ${registerFeeLamports} lamports (${Number(registerFeeLamports) / 1e9} SOL)`)
console.log(`  add_key_fee:   ${addKeyFeeLamports} lamports (${Number(addKeyFeeLamports) / 1e9} SOL)`)
console.log(`  cluster:       ${rpc}`)
console.log()

// ── Build instruction ─────────────────────────────────────────────────────────

// sha256("global:init_config")[0..8]
const disc = Buffer.from([23, 235, 115, 232, 168, 96, 1, 231])

const registerFeeBuf = Buffer.alloc(8)
const addKeyFeeBuf   = Buffer.alloc(8)
registerFeeBuf.writeBigUInt64LE(registerFeeLamports)
addKeyFeeBuf.writeBigUInt64LE(addKeyFeeLamports)

const data = Buffer.concat([disc, registerFeeBuf, addKeyFeeBuf, treasuryPubkey.toBuffer()])

const ix = new TransactionInstruction({
  programId: tranaGuardProgramId,
  keys: [
    { pubkey: configPda,               isSigner: false, isWritable: true  },
    { pubkey: payer.publicKey,         isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
tx.add(ix)
tx.sign(payer)

const sig = await connection.sendRawTransaction(tx.serialize())
await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
console.log(`init_config ok`)
console.log(`  sig: ${sig}`)
