/**
 * Helpers for BPF Loader Upgradeable operations needed in integration tests.
 *
 * Creating an upgrade buffer for a 262 KB .so file requires ~290 on-chain
 * Write transactions. Doing that sequentially in TypeScript takes ~2 minutes.
 * The Solana CLI (`solana program write-buffer`) pipelines and batches those
 * writes in parallel — same result, ~5 seconds. We delegate to it here.
 */

import { execSync }                     from "child_process"
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js"
import * as fs   from "fs"
import * as os   from "os"
import * as path from "path"

const BPF_LOADER     = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
const DEFAULT_KEYPAIR = path.join(os.homedir(), ".config/solana/id.json")

// ── Buffer creation via CLI ───────────────────────────────────────────────────

/**
 * Write a compiled .so file into a fresh buffer account and transfer the buffer
 * authority to `pdaAuthority`. Returns the buffer public key.
 *
 * Uses `solana program write-buffer` so chunking and transaction pipelining are
 * handled by the CLI (fast). Falls back to an error with a helpful message if
 * the CLI is not on PATH.
 */
export function createUpgradeBuffer(
  soPath:       string,
  pdaAuthority: PublicKey,
  keypairPath = DEFAULT_KEYPAIR,
  rpcUrl      = "http://127.0.0.1:8899",
): PublicKey {
  // Write bytecode — authority defaults to the local wallet
  let writeOut: string
  try {
    writeOut = execSync(
      `solana program write-buffer ${soPath} --keypair ${keypairPath} --url ${rpcUrl}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
  } catch (e: any) {
    throw new Error(
      `solana program write-buffer failed.\n` +
      `Make sure the Solana CLI is on PATH and a local validator is running.\n` +
      `Original error: ${e.message}`,
    )
  }

  const match = writeOut.match(/Buffer: ([1-9A-HJ-NP-Za-km-z]{32,44})/)
  if (!match) throw new Error(`Could not parse buffer address from CLI output:\n${writeOut}`)
  const buffer = new PublicKey(match[1])

  // Hand the buffer authority over to the PDA
  execSync(
    `solana program set-buffer-authority ${buffer.toBase58()} ` +
    `--new-buffer-authority ${pdaAuthority.toBase58()} ` +
    `--keypair ${keypairPath} --url ${rpcUrl}`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  )

  return buffer
}

// ── Fresh upgradeable deployment ──────────────────────────────────────────────

/**
 * Deploy a fresh upgradeable program at a newly-generated address.
 * Returns the program public key. The upgrade authority is set to the CLI wallet.
 *
 * Use this when the test needs a genuinely upgradeable program — programs
 * loaded via `--bpf-program` (anchor's test-validator) are immutable
 * (authority = 11111...1) and cannot have their authority transferred.
 */
export function deployFreshProgram(
  soPath:       string,
  keypairPath = DEFAULT_KEYPAIR,
  rpcUrl      = "http://127.0.0.1:8899",
): PublicKey {
  const tmpKpPath = path.join(os.tmpdir(), `trana-deploy-${Date.now()}.json`)
  const kp = Keypair.generate()
  fs.writeFileSync(tmpKpPath, JSON.stringify(Array.from(kp.secretKey)))
  try {
    execSync(
      `solana program deploy ${soPath} ` +
      `--program-id ${tmpKpPath} ` +
      `--keypair ${keypairPath} ` +
      `--url ${rpcUrl}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
  } catch (e: any) {
    throw new Error(
      `solana program deploy failed.\n` +
      `Make sure the Solana CLI is on PATH and a local validator is running.\n` +
      `Original error: ${e.message}`,
    )
  } finally {
    fs.unlinkSync(tmpKpPath)
  }
  return kp.publicKey
}

// ── Raw BPF Loader instructions (for lower-level tests) ───────────────────────

export { BPF_LOADER }

/** BPF Loader Upgradeable set_upgrade_authority (variant 4). */
export function setUpgradeAuthorityIx(
  programData:      PublicKey,
  currentAuthority: PublicKey,
  newAuthority:     PublicKey,
): TransactionInstruction {
  const data = Buffer.alloc(4)
  data.writeUInt32LE(4, 0)
  return new TransactionInstruction({
    programId: BPF_LOADER,
    keys: [
      { pubkey: programData,      isSigner: false, isWritable: true  },
      { pubkey: currentAuthority, isSigner: true,  isWritable: false },
      { pubkey: newAuthority,     isSigner: false, isWritable: false },
    ],
    data,
  })
}
