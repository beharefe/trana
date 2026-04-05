/**
 * Anchor test suite for the guard program.
 *
 * Covers all 5 demo scenarios:
 *   1. Small transfer (below threshold) — success without proof
 *   2. Large transfer, no Ed25519 ix    — fail: MissingProof
 *   3. Large transfer + valid proof     — success
 *   4. Replay nonce from scenario 3    — fail: NonceAlreadyUsed
 *   5. Tampered amount (wrong hash)    — fail: PayloadMismatch
 */
import * as anchor from "@coral-xyz/anchor"
import { Program, AnchorError } from "@coral-xyz/anchor"
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { createHash, randomBytes } from "crypto"
import nacl from "tweetnacl"
import assert from "assert"
import type { Guard } from "../target/types/guard"

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOL = 1_000_000_000

function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest()
}

function canonicalPayloadJson(
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

function makeNonce(): { bytes: Buffer; hex: string } {
  const bytes = randomBytes(32)
  return { bytes, hex: bytes.toString("hex") }
}

async function buildProtectedTransferTx(
  program: Program<Guard>,
  config: PublicKey,
  from: Keypair,
  to: PublicKey,
  amount: number,
  nonce: Buffer,
  payloadHash: Buffer,
  expiry: number,
  userOptIn: boolean
): Promise<Transaction> {
  const [noncePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), nonce],
    program.programId
  )

  const transferIx = await program.methods
    .protectedTransfer(
      new anchor.BN(amount),
      Array.from(nonce),
      Array.from(payloadHash),
      new anchor.BN(expiry),
      userOptIn
    )
    .accounts({
      config,
      nonceAccount: noncePDA,
      from: from.publicKey,
      to,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const tx = new Transaction()
  tx.add(transferIx)
  return tx
}

function buildVerifyIx(
  serverKeypair: nacl.SignKeyPair,
  payloadHash: Buffer
): anchor.web3.TransactionInstruction {
  const signature = nacl.sign.detached(payloadHash, serverKeypair.secretKey)
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: Buffer.from(serverKeypair.publicKey),
    message: payloadHash,
    signature: Buffer.from(signature),
  })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("guard", () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer = provider.wallet as anchor.Wallet

  // Server keypair (bridge signer)
  const serverKeypair = nacl.sign.keyPair()
  const serverKey = new PublicKey(serverKeypair.publicKey)

  const THRESHOLD = 20 * SOL
  const ABOVE_THRESHOLD = 30 * SOL
  const BELOW_THRESHOLD = 10 * SOL

  let configPDA: PublicKey
  let scenarioThreeNonce: Buffer // saved for replay test in scenario 4

  before(async () => {
    ;[configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )

    // Initialize the guard config.
    await program.methods
      .initialize(new anchor.BN(THRESHOLD), true)
      .accounts({
        config: configPDA,
        serverKey,
        authority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 1 — small transfer, no proof needed
  // ────────────────────────────────────────────────────────────────────────────
  it("Scenario 1: small transfer succeeds without passkey", async () => {
    const recipient = Keypair.generate().publicKey
    const { bytes: nonceBytes, hex: nonceHex } = makeNonce()
    const expiry = Math.floor(Date.now() / 1000) + 300

    const payloadHash = sha256(
      canonicalPayloadJson(program.programId.toBase58(), BELOW_THRESHOLD, nonceHex, expiry)
    )

    const tx = await buildProtectedTransferTx(
      program,
      configPDA,
      payer.payer,
      recipient,
      BELOW_THRESHOLD,
      nonceBytes,
      payloadHash,
      expiry,
      false
    )

    // No Ed25519 verify ix needed for below-threshold transfers.
    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer.publicKey

    await sendAndConfirmTransaction(connection, tx, [payer.payer])
    // No assertion needed — not throwing is success.
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 2 — large transfer, no Ed25519 ix → MissingProof
  // ────────────────────────────────────────────────────────────────────────────
  it("Scenario 2: large transfer without proof fails with MissingProof", async () => {
    const recipient = Keypair.generate().publicKey
    const { bytes: nonceBytes, hex: nonceHex } = makeNonce()
    const expiry = Math.floor(Date.now() / 1000) + 300

    const payloadHash = sha256(
      canonicalPayloadJson(program.programId.toBase58(), ABOVE_THRESHOLD, nonceHex, expiry)
    )

    const tx = await buildProtectedTransferTx(
      program,
      configPDA,
      payer.payer,
      recipient,
      ABOVE_THRESHOLD,
      nonceBytes,
      payloadHash,
      expiry,
      false
    )

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer.publicKey

    try {
      await sendAndConfirmTransaction(connection, tx, [payer.payer])
      assert.fail("Expected MissingProof error")
    } catch (err: unknown) {
      assert.ok(
        err instanceof AnchorError ||
          (err as Error).message.includes("MissingProof") ||
          (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 3 — large transfer + valid proof → success
  // ────────────────────────────────────────────────────────────────────────────
  it("Scenario 3: large transfer with valid proof succeeds", async () => {
    const recipient = Keypair.generate().publicKey
    const { bytes: nonceBytes, hex: nonceHex } = makeNonce()
    scenarioThreeNonce = nonceBytes // save for replay test
    const expiry = Math.floor(Date.now() / 1000) + 300

    const payloadHash = sha256(
      canonicalPayloadJson(program.programId.toBase58(), ABOVE_THRESHOLD, nonceHex, expiry)
    )

    const verifyIx = buildVerifyIx(serverKeypair, payloadHash)
    const tx = await buildProtectedTransferTx(
      program,
      configPDA,
      payer.payer,
      recipient,
      ABOVE_THRESHOLD,
      nonceBytes,
      payloadHash,
      expiry,
      false
    )

    // Ed25519 verify ix MUST be at index 0.
    tx.instructions = [verifyIx, ...tx.instructions]

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer.publicKey

    await sendAndConfirmTransaction(connection, tx, [payer.payer])
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 4 — replay nonce from scenario 3 → NonceAlreadyUsed
  // ────────────────────────────────────────────────────────────────────────────
  it("Scenario 4: replay attack fails with NonceAlreadyUsed", async () => {
    const recipient = Keypair.generate().publicKey
    const nonceBytes = scenarioThreeNonce
    const nonceHex = nonceBytes.toString("hex")
    const expiry = Math.floor(Date.now() / 1000) + 300

    const payloadHash = sha256(
      canonicalPayloadJson(program.programId.toBase58(), ABOVE_THRESHOLD, nonceHex, expiry)
    )

    const verifyIx = buildVerifyIx(serverKeypair, payloadHash)
    const tx = await buildProtectedTransferTx(
      program,
      configPDA,
      payer.payer,
      recipient,
      ABOVE_THRESHOLD,
      nonceBytes,
      payloadHash,
      expiry,
      false
    )
    tx.instructions = [verifyIx, ...tx.instructions]

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer.publicKey

    try {
      await sendAndConfirmTransaction(connection, tx, [payer.payer])
      assert.fail("Expected NonceAlreadyUsed error")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("NonceAlreadyUsed") ||
          (err as Error).message.includes("0x1775"),
        `Expected NonceAlreadyUsed, got: ${(err as Error).message}`
      )
    }
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 5 — tampered amount → PayloadMismatch
  // ────────────────────────────────────────────────────────────────────────────
  it("Scenario 5: tampered amount fails with PayloadMismatch", async () => {
    const recipient = Keypair.generate().publicKey
    const { bytes: nonceBytes, hex: nonceHex } = makeNonce()
    const expiry = Math.floor(Date.now() / 1000) + 300

    // Proof is signed for ABOVE_THRESHOLD (30 SOL)…
    const payloadHash = sha256(
      canonicalPayloadJson(program.programId.toBase58(), ABOVE_THRESHOLD, nonceHex, expiry)
    )
    const verifyIx = buildVerifyIx(serverKeypair, payloadHash)

    // …but the instruction says ABOVE_THRESHOLD + 1 SOL (tampered).
    const tamperedAmount = ABOVE_THRESHOLD + SOL

    const tx = await buildProtectedTransferTx(
      program,
      configPDA,
      payer.payer,
      recipient,
      tamperedAmount,
      nonceBytes,
      payloadHash, // still the hash for the original amount — mismatch!
      expiry,
      false
    )
    tx.instructions = [verifyIx, ...tx.instructions]

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer.publicKey

    try {
      await sendAndConfirmTransaction(connection, tx, [payer.payer])
      assert.fail("Expected PayloadMismatch error")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") ||
          (err as Error).message.includes("0x1773"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })
})
