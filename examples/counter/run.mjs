#!/usr/bin/env node
import { execSync, spawn }                        from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve }                                 from "node:path"
import { fileURLToPath }                           from "node:url"
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { sha256 } from "@noble/hashes/sha256"

const DIR            = fileURLToPath(new URL(".", import.meta.url))
const REPO_ROOT      = resolve(DIR, "../..")
const TRANA_SO       = resolve(REPO_ROOT, "target/deploy/trana_guard.so")
const TRANA_GUARD_ID = new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn")
const RPC            = "http://127.0.0.1:8899"
const ENV            = { ...process.env, RUSTFLAGS: "-Awarnings", CARGO_TERM_COLOR: "never" }

// ── 1. Build ──────────────────────────────────────────────────────────────────

if (!existsSync(TRANA_SO)) {
  step("Building trana_guard (first time — ~2 min)…")
  run("anchor build -p trana_guard", { cwd: REPO_ROOT })
}

step("Building counter…")
run("anchor build",     { cwd: DIR })
run("anchor keys sync", { cwd: DIR })
run("anchor build",     { cwd: DIR })

const COUNTER_SO = resolve(DIR, "target/deploy/counter.so")
if (!existsSync(COUNTER_SO)) die("anchor build produced no counter.so — check for compile errors above")

const programId = capture("solana address -k target/deploy/counter-keypair.json", { cwd: DIR })
writeFileSync(resolve(DIR, "app/.env.local"), `VITE_COUNTER_PROGRAM_ID=${programId}\n`)
ok(`Counter: ${programId}`)

// ── 2. Validator ──────────────────────────────────────────────────────────────

step("Starting validator…")
const validator = spawn(
  "solana-test-validator",
  [
    // Clone the secp256r1 native precompile from devnet so simulation works locally
    "--url",   "https://api.devnet.solana.com",
    "--clone", "Secp256r1SigVerify1111111111111111111111111",
    "--bpf-program", TRANA_GUARD_ID.toBase58(), TRANA_SO,
    "--reset", "--quiet",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
)
validator.on("exit", code => { if (code) die(`Validator exited (${code})`) })

const connection = new Connection(RPC, "confirmed")
await waitForRpc(connection)

// ── 3. Fund + deploy ──────────────────────────────────────────────────────────

const authority = loadCliWallet()
await airdropIfNeeded(connection, authority.publicKey)

step("Deploying counter…")
run("anchor deploy", { cwd: DIR })

// verify both programs are live before starting the app
await verifyPrograms(connection, [
  { name: "trana_guard", id: TRANA_GUARD_ID },
  { name: "counter",     id: new PublicKey(programId) },
])

// ── 4. trana_guard config ─────────────────────────────────────────────────────

await initTranaConfig(connection, authority)

// ── 5. Frontend ───────────────────────────────────────────────────────────────

const appDir = resolve(DIR, "app")
if (!existsSync(resolve(appDir, "node_modules"))) {
  step("Installing app dependencies…")
  run("npm install", { cwd: appDir })
}

step("Ready → http://localhost:5173\n")
const vite = spawn("npm", ["run", "dev"], { cwd: appDir, stdio: "inherit" })
vite.on("exit", code => { if (code) die(`Vite exited (${code})`) })

const cleanup = () => { validator.kill(); vite.kill(); process.exit(0) }
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// ── Helpers ───────────────────────────────────────────────────────────────────

function step(msg) { console.log(`\n\x1b[36m▸\x1b[0m ${msg}`) }
function ok(msg)   { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function die(msg)  { console.error(`\n\x1b[31m✗\x1b[0m ${msg}\n`); process.exit(1) }

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd, env: ENV })
}

function capture(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: opts.cwd }).trim()
}

function loadCliWallet() {
  const p = `${process.env.HOME}/.config/solana/id.json`
  if (!existsSync(p)) die(`No Solana CLI wallet — run: solana-keygen new`)
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))))
}

async function waitForRpc(conn, timeoutSec = 30) {
  for (let i = 0; i < timeoutSec; i++) {
    try { await conn.getLatestBlockhash(); ok("Validator ready"); return } catch { /**/ }
    await new Promise(r => setTimeout(r, 1000))
  }
  die("Validator did not start in time")
}

async function airdropIfNeeded(conn, pubkey) {
  const bal = await conn.getBalance(pubkey)
  if (bal >= 2e9) return
  step("Airdropping SOL to CLI wallet…")
  const sig = await conn.requestAirdrop(pubkey, 4e9)
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash()
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
  ok(`Funded ${pubkey.toBase58().slice(0, 8)}…`)
}

async function verifyPrograms(conn, programs) {
  for (const { name, id } of programs) {
    const info = await conn.getAccountInfo(id)
    if (!info?.executable) die(`${name} not deployed at ${id.toBase58()} — is the .so built?`)
    ok(`${name} @ ${id.toBase58().slice(0, 8)}…`)
  }
}

async function initTranaConfig(conn, authority) {
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], TRANA_GUARD_ID)
  if (await conn.getAccountInfo(configPda)) { ok("trana_guard config exists"); return }

  step("Initializing trana_guard config…")
  const data = Buffer.concat([
    Buffer.from(sha256("global:init_config")).subarray(0, 8),
    Buffer.alloc(8),                  // register_fee = 0
    Buffer.alloc(8),                  // add_key_fee  = 0
    authority.publicKey.toBuffer(),   // treasury
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
  await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority])
  ok("trana_guard config initialized")
}
