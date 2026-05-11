#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Transfer a program's upgrade authority to a Trana Authority PDA.
// After this, the wallet key alone cannot upgrade the program — a passkey proof is required.
//
// Usage:
//   node scripts/secure-upgrade-authority.mjs <authority-program-id> <target-program-id> <keypair.json>
//
// Example (secure the vault):
//   node scripts/secure-upgrade-authority.mjs \
//     TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN \
//     8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa \
//     ~/.config/solana/id.json

import { readFileSync } from "fs"
import {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, SystemProgram,
} from "@solana/web3.js"
import { execSync } from "child_process"

const [,, authorityProgramId, targetProgramId, keypairPath] = process.argv
if (!authorityProgramId || !targetProgramId || !keypairPath) {
  console.error("Usage: node secure-upgrade-authority.mjs <authority-program-id> <target-program-id> <keypair.json>")
  process.exit(1)
}

const RPC  = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com"
const conn = new Connection(RPC, "confirmed")

const secret = JSON.parse(readFileSync(keypairPath, "utf8"))
const owner  = Keypair.fromSecretKey(Uint8Array.from(secret))

const AUTHORITY_PROGRAM = new PublicKey(authorityProgramId)
const TARGET            = new PublicKey(targetProgramId)

// Derive the PDA that will become the new upgrade authority
// Seeds: [b"trana-authority", owner, target]
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.publicKey.toBuffer(), TARGET.toBuffer()],
  AUTHORITY_PROGRAM,
)

console.log(`Owner:            ${owner.publicKey.toBase58()}`)
console.log(`Target program:   ${TARGET.toBase58()}`)
console.log(`Authority PDA:    ${pda.toBase58()}`)
console.log(`trana_authority:  ${AUTHORITY_PROGRAM.toBase58()}`)
console.log()

// Step 1 — register() instruction
// sha256("global:register")[0..8]
const disc = Buffer.from([211, 124, 67, 15, 211, 194, 178, 240])

const [recordPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.publicKey.toBuffer(), TARGET.toBuffer()],
  AUTHORITY_PROGRAM,
)

const registerIx = new TransactionInstruction({
  programId: AUTHORITY_PROGRAM,
  keys: [
    { pubkey: recordPda,             isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey,       isSigner: true,  isWritable: true  },
    { pubkey: TARGET,                isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: disc,
})

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(registerIx)
tx.sign(owner)

console.log("Step 1 — registering AuthorityRecord PDA...")
const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) {
  console.error("Registration failed:", result.value.err)
  process.exit(1)
}
console.log(`  ✓ registered: ${sig}`)
console.log()

// Step 2 — transfer upgrade authority via Solana CLI
console.log("Step 2 — transferring upgrade authority to PDA...")
const cmd = `solana program set-upgrade-authority ${TARGET.toBase58()} --new-upgrade-authority ${pda.toBase58()} --url ${RPC} --keypair ${keypairPath}`
console.log(`  $ ${cmd}`)
try {
  const out = execSync(cmd, { encoding: "utf8" })
  console.log("  " + out.trim())
} catch (e) {
  console.error("  failed:", e.message)
  process.exit(1)
}

console.log()
console.log("✓ Done. The upgrade authority is now the Trana PDA.")
console.log(`  Upgrade authority: ${pda.toBase58()}`)
console.log(`  To upgrade in future: passkey proof required`)
console.log()
console.log("  Solscan:")
console.log(`  https://solscan.io/account/${TARGET.toBase58()}?cluster=devnet`)
