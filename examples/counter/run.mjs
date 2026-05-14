#!/usr/bin/env node
/**
 * Trana Counter — full local dev launcher.
 * Builds programs, starts validator, deploys, inits config, starts frontend.
 *
 * Usage: npm start  (from examples/counter/)
 */

import { execSync, spawn }                         from "node:child_process"
import { existsSync, readFileSync, writeFileSync }  from "node:fs"
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { sha256 } from "@noble/hashes/sha256"

const TRANA_GUARD_ID = new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn")
const RPC            = "http://127.0.0.1:8899"

// ── 1. Build programs ─────────────────────────────────────────────────────────

log("Checking trana_guard build…")
if (!existsSync("../../target/deploy/trana_guard.so")) {
  log("Building trana_guard (first time — may take ~2 min)…")
  run("anchor build -p trana_guard", { cwd: "../.." })
}

log("Building counter…")
run("anchor build")
run("anchor keys sync")
run("anchor build")

const programId = capture("solana address -k target/deploy/counter-keypair.json")
writeFileSync("app/.env.local", `VITE_COUNTER_PROGRAM_ID=${programId}\n`)
log(`Counter program ID: ${programId}`)

// ── 2. Start validator ────────────────────────────────────────────────────────

log("Starting solana-test-validator…")
const validator = spawn(
  "solana-test-validator",
  ["--bpf-program", TRANA_GUARD_ID.toBase58(), "../../target/deploy/trana_guard.so", "--reset", "--quiet"],
  { stdio: "inherit" },
)
validator.on("exit", code => { if (code) die(`Validator exited with code ${code}`) })

// ── 3. Wait for RPC ───────────────────────────────────────────────────────────

const connection = new Connection(RPC, "confirmed")
log("Waiting for validator to be ready…")
await waitForRpc(connection)

// ── 4. Fund CLI wallet + deploy counter ──────────────────────────────────────

const authority = loadCliWallet()
await airdropIfNeeded(connection, authority.publicKey, 4e9)

log("Deploying counter…")
run("anchor deploy")

// ── 5. Init trana_guard config (fees = 0, localnet only) ─────────────────────

await initTranaConfig(connection, authority)

// ── 6. Install app deps (if needed) + start Vite ─────────────────────────────

if (!existsSync("app/node_modules")) {
  log("Installing app dependencies…")
  run("npm install", { cwd: "app" })
}

log("Starting frontend → http://localhost:5173\n")
const vite = spawn("npm", ["run", "dev"], { cwd: "app", stdio: "inherit" })
vite.on("exit", code => { if (code) die(`Vite exited with code ${code}`) })

// ── Cleanup ───────────────────────────────────────────────────────────────────

const cleanup = () => { validator.kill(); vite.kill(); process.exit(0) }
process.on("SIGINT",  cleanup)
process.on("SIGTERM", cleanup)

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\x1b[36m→\x1b[0m ${msg}`) }
function die(msg)  { console.error(`\x1b[31m✗\x1b[0m ${msg}`); process.exit(1) }

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd })
}

function capture(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: opts.cwd }).trim()
}

function loadCliWallet() {
  const path = `${process.env.HOME}/.config/solana/id.json`
  if (!existsSync(path)) die(`No Solana CLI wallet at ${path} — run: solana-keygen new`)
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))))
}

async function waitForRpc(connection, timeoutSec = 30) {
  for (let i = 0; i < timeoutSec; i++) {
    try { await connection.getLatestBlockhash(); return } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1000))
  }
  die("Validator did not become ready in time")
}

async function airdropIfNeeded(connection, pubkey, lamports) {
  const balance = await connection.getBalance(pubkey)
  if (balance >= lamports / 2) return
  log(`Airdropping ${lamports / 1e9} SOL to CLI wallet…`)
  const sig = await connection.requestAirdrop(pubkey, lamports)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
}

async function initTranaConfig(connection, authority) {
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], TRANA_GUARD_ID)
  if (await connection.getAccountInfo(configPda)) return // already initialized

  log("Initializing trana_guard config (fees = 0)…")
  // discriminator(8) | register_fee u64(8) | add_key_fee u64(8) | treasury pubkey(32)
  const data = Buffer.concat([
    Buffer.from(sha256("global:init_config")).subarray(0, 8),
    Buffer.alloc(8),  // register_fee = 0
    Buffer.alloc(8),  // add_key_fee  = 0
    authority.publicKey.toBuffer(), // treasury = authority
  ])

  const ix = new TransactionInstruction({
    programId: TRANA_GUARD_ID,
    keys: [
      { pubkey: configPda,               isWritable: true,  isSigner: false },
      { pubkey: authority.publicKey,     isWritable: true,  isSigner: true  },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ],
    data,
  })

  await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority])
  log("trana_guard config initialized")
}
