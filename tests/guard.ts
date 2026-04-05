/**
 * Anchor test suite for the Transaction Authorization Guard.
 *
 * Tests two instruction paths:
 *   A. protected_transfer  — direct SOL, random nonce
 *   B. vault_withdraw      — vault PDA, monotonic nonce
 *
 * Demo scenarios (vault path, most compelling for hackathon):
 *   1. Attacker sends withdrawal without proof        → MissingProof
 *   2. Legit user: small withdrawal (no 2FA needed)  → Success
 *   3. Legit user: large withdrawal + valid proof    → Success
 *   4. Replay same nonce from scenario 3             → InvalidNonce
 *   5. Tampered amount (proof for wrong hash)        → PayloadMismatch
 *
 * protected_transfer scenarios:
 *   6. Small transfer (no 2FA)                       → Success
 *   7. Large transfer without proof                  → MissingProof
 *   8. Large transfer + valid proof                  → Success
 *   9. Replay nonce from scenario 8                  → NonceAlreadyUsed
 */
import pkg from "@coral-xyz/anchor"
const { AnchorError, BN, AnchorProvider, workspace, setProvider } = pkg
type Program<T extends pkg.Idl> = pkg.Program<T>
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { createHash, randomBytes } from "crypto"
import nacl from "tweetnacl"
import assert from "assert"
import type { Guard } from "../target/types/guard"

// ── Shared state (both test suites must use the same server keypair) ──────────

// Single server keypair — Config PDA is initialised once by the vault suite.
// The protected_transfer suite reuses it without re-initialising.
const SHARED_SERVER_KP = nacl.sign.keyPair()

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOL = 1_000_000_000

function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest()
}

function canonicalPayload(
  programId: string,
  amount: number,
  nonce: string,
  expiry: number
): string {
  return JSON.stringify({
    programId,
    instruction: "transfer",
    amount,
    nonce,
    expiry,
  })
}

function canonicalVaultPayload(
  programId: string,
  vault: string,
  amount: number,
  nonce: number,
  expiry: number
): string {
  return JSON.stringify({
    programId,
    instruction: "vault_withdraw",
    vault,
    amount,
    nonce,
    expiry,
  })
}

function makeNonce32(): { bytes: Buffer; hex: string } {
  const bytes = randomBytes(32)
  return { bytes, hex: bytes.toString("hex") }
}

function buildVerifyIx(
  kp: nacl.SignKeyPair,
  payloadHash: Buffer
): TransactionInstruction {
  const sig = nacl.sign.detached(payloadHash, kp.secretKey)
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey:  Buffer.from(kp.publicKey),
    message:    payloadHash,
    signature:  Buffer.from(sig),
  })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("guard — vault path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  const serverKp   = SHARED_SERVER_KP
  const serverKey  = new PublicKey(serverKp.publicKey)

  const THRESHOLD  = 20 * SOL
  const ABOVE      = 30 * SOL
  const BELOW      = 5  * SOL
  const FUND_VAULT = 50 * SOL

  let configPda: PublicKey
  let vaultPda:  PublicKey

  // Vault nonce tracking (mirrors VaultState.next_nonce)
  let nextNonce = 0

  before(async () => {
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )
    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), payer.publicKey.toBuffer()],
      program.programId
    )

    await program.methods
      .initialize(new BN(THRESHOLD), true)
      .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()

    await program.methods
      .initVault(false)
      .accounts({ vault: vaultPda, owner: payer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()

    await program.methods
      .deposit(new BN(FUND_VAULT))
      .accounts({ vault: vaultPda, owner: payer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()
  })

  // ── Helper: build + send vault_withdraw tx ──────────────────────────────────
  async function vaultWithdrawTx(
    amount: number,
    nonce: number,
    payloadHash: Buffer,
    expiry: number,
    withProof: boolean
  ): Promise<string> {
    const dest = Keypair.generate().publicKey

    const ix = await program.methods
      .vaultWithdraw(
        new BN(amount),
        new BN(nonce),
        Array.from(payloadHash),
        new BN(expiry)
      )
      .accounts({
        config:       configPda,
        vault:        vaultPda,
        owner:        payer.publicKey,
        to:           dest,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })

    if (withProof) {
      tx.add(buildVerifyIx(serverKp, payloadHash))
    }
    tx.add(ix)

    return sendAndConfirmTransaction(connection, tx, [payer.payer])
  }

  // ── 1. Attacker — no proof → MissingProof ───────────────────────────────────
  it("Scenario 1: attacker without proof fails with MissingProof", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry
    ))

    try {
      await vaultWithdrawTx(ABOVE, nextNonce, hash, expiry, false /* no proof */)
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") ||
        (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })

  // ── 2. Small withdrawal — no 2FA needed → Success ───────────────────────────
  it("Scenario 2: small withdrawal succeeds without proof", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), BELOW, nextNonce, expiry
    ))

    await vaultWithdrawTx(BELOW, nextNonce, hash, expiry, false)
    nextNonce++
  })

  // ── 3. Large withdrawal + valid proof → Success ──────────────────────────────
  it("Scenario 3: large withdrawal with valid proof succeeds", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry
    ))

    await vaultWithdrawTx(ABOVE, nextNonce, hash, expiry, true)
    nextNonce++
  })

  // ── 4. Replay nonce → InvalidNonce ──────────────────────────────────────────
  it("Scenario 4: replay attack fails with InvalidNonce", async () => {
    const oldNonce = nextNonce - 1 // already consumed in scenario 3
    const expiry   = Math.floor(Date.now() / 1000) + 300
    const hash     = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), ABOVE, oldNonce, expiry
    ))

    try {
      await vaultWithdrawTx(ABOVE, oldNonce, hash, expiry, true)
      assert.fail("Expected InvalidNonce")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("InvalidNonce") ||
        (err as Error).message.includes("0x1773"),
        `Expected InvalidNonce, got: ${(err as Error).message}`
      )
    }
  })

  // ── 5. Tampered amount → PayloadMismatch ────────────────────────────────────
  it("Scenario 5: tampered amount fails with PayloadMismatch", async () => {
    const expiry    = Math.floor(Date.now() / 1000) + 300
    const realHash  = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry
    ))
    // Proof signed for ABOVE, but we send ABOVE + 1 SOL in the instruction
    const tampered  = ABOVE + SOL

    try {
      await vaultWithdrawTx(tampered, nextNonce, realHash, expiry, true)
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") ||
        (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })
})

describe("guard — protected_transfer path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  const serverKp   = SHARED_SERVER_KP
  const serverKey  = new PublicKey(serverKp.publicKey)

  const THRESHOLD = 20 * SOL
  const ABOVE     = 30 * SOL
  const BELOW     = 10 * SOL

  let configPda:      PublicKey
  let scenario8Nonce: Buffer  // saved for replay test

  before(async () => {
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )
    // Config already initialised by vault suite above — call update if needed
    try {
      await program.methods
        .initialize(new BN(THRESHOLD), true)
        .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch { /* already initialised */ }
  })

  async function protectedTransferTx(
    amount: number,
    nonce: Buffer,
    payloadHash: Buffer,
    expiry: number,
    optIn: boolean,
    withProof: boolean
  ): Promise<string> {
    const [noncePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), nonce],
      program.programId
    )
    const to = Keypair.generate().publicKey
    const ix = await program.methods
      .protectedTransfer(
        new BN(amount),
        Array.from(nonce),
        Array.from(payloadHash),
        new BN(expiry),
        optIn
      )
      .accounts({
        config:       configPda,
        nonceAccount: noncePda,
        from:         payer.publicKey,
        to,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
    if (withProof) tx.add(buildVerifyIx(serverKp, payloadHash))
    tx.add(ix)
    return sendAndConfirmTransaction(connection, tx, [payer.payer])
  }

  // ── 6. Small transfer → Success (no 2FA) ────────────────────────────────────
  it("Scenario 6: small transfer succeeds without proof", async () => {
    const { bytes, hex } = makeNonce32()
    const expiry  = Math.floor(Date.now() / 1000) + 300
    const hash    = sha256(canonicalPayload(program.programId.toBase58(), BELOW, hex, expiry))
    await protectedTransferTx(BELOW, bytes, hash, expiry, false, false)
  })

  // ── 7. Large transfer without proof → MissingProof ──────────────────────────
  it("Scenario 7: large transfer without proof fails with MissingProof", async () => {
    const { bytes, hex } = makeNonce32()
    const expiry  = Math.floor(Date.now() / 1000) + 300
    const hash    = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))

    try {
      await protectedTransferTx(ABOVE, bytes, hash, expiry, false, false)
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") ||
        (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })

  // ── 8. Large transfer + valid proof → Success ────────────────────────────────
  it("Scenario 8: large transfer with valid proof succeeds", async () => {
    const { bytes, hex } = makeNonce32()
    scenario8Nonce = bytes
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))
    await protectedTransferTx(ABOVE, bytes, hash, expiry, false, true)
  })

  // ── 9. Replay → NonceAlreadyUsed ─────────────────────────────────────────────
  it("Scenario 9: replay of used nonce fails with NonceAlreadyUsed", async () => {
    const hex    = scenario8Nonce.toString("hex")
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))

    try {
      await protectedTransferTx(ABOVE, scenario8Nonce, hash, expiry, false, true)
      assert.fail("Expected NonceAlreadyUsed")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("NonceAlreadyUsed") ||
        (err as Error).message.includes("0x1775"),
        `Expected NonceAlreadyUsed, got: ${(err as Error).message}`
      )
    }
  })
})
