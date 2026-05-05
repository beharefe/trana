#!/usr/bin/env node
/**
 * One-time init_config for the Trana guard program.
 * Usage: node scripts/init-config.mjs <guardProgramId> <treasuryAddr>
 * Env:   ANCHOR_PROVIDER_URL, ANCHOR_WALLET
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { readFileSync } from "fs"

const [,, guardId, treasury] = process.argv
if (!guardId || !treasury) {
  console.error("Usage: init-config.mjs <guardProgramId> <treasuryAddr>")
  process.exit(1)
}

const rpc         = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899"
const walletPath  = process.env.ANCHOR_WALLET
if (!walletPath) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const connection = new Connection(rpc, "confirmed")
const secret     = JSON.parse(readFileSync(walletPath, "utf8"))
const payer      = Keypair.fromSecretKey(Uint8Array.from(secret))

const guardProgramId = new PublicKey(guardId)
const treasuryPubkey = new PublicKey(treasury)

// Check if config PDA already exists
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], guardProgramId)
const existing = await connection.getAccountInfo(configPda)
if (existing) {
  console.log("Fee config already initialized at", configPda.toBase58())
  process.exit(0)
}

// init_config discriminator (SHA-256("global:init_config")[0..8])
const disc = Buffer.from([23, 235, 115, 232, 168, 96, 1, 231])

// Encode args: register_fee (u64 LE) + recovery_fee (u64 LE) + treasury (32 bytes)
const registerFeeBuf = Buffer.alloc(8)  // 0 lamports
const recoveryFeeBuf = Buffer.alloc(8)  // 0 lamports

const data = Buffer.concat([
  disc,
  registerFeeBuf,
  recoveryFeeBuf,
  treasuryPubkey.toBuffer(),
])

const ix = new TransactionInstruction({
  programId: guardProgramId,
  keys: [
    { pubkey: configPda,               isSigner: false, isWritable: true  },
    { pubkey: payer.publicKey,         isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
})

const { blockhash } = await connection.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
tx.add(ix)
tx.sign(payer)

const sig = await connection.sendRawTransaction(tx.serialize())
await connection.confirmTransaction(sig, "confirmed")
console.log(`init_config ok → sig=${sig}`)
