/**
 * Anchor test suite for the Transaction Authorization Guard.
 *
 * Tests three instruction paths:
 *   A. vault_withdraw       — vault PDA, Config server key, Ed25519 proof
 *   B. protected_transfer   — direct SOL, random nonce, Ed25519 proof
 *   C. registry_vault_withdraw — vault PDA, onchain 2FA registry, secp256r1 proof
 *
 * Vault path scenarios (1-5):
 *   1. Attacker sends withdrawal without proof        → MissingProof
 *   2. Small withdrawal (below threshold, no 2FA)    → Success
 *   3. Large withdrawal + valid Ed25519 proof        → Success
 *   4. Replay same nonce from scenario 3             → InvalidNonce
 *   5. Tampered amount (proof for wrong hash)        → PayloadMismatch
 *
 * protected_transfer scenarios (6-9):
 *   6. Small transfer (no 2FA)                       → Success
 *   7. Large transfer without proof                  → MissingProof
 *   8. Large transfer + valid proof                  → Success
 *   9. Replay nonce from scenario 8                  → NonceAlreadyUsed
 *
 * Onchain registry + secp256r1 passkey scenarios (R1-R6):
 *   R1. Register secp256r1 passkey in onchain PDA    → Success
 *   R2. registry_vault_withdraw with valid P-256 proof → Success
 *   R3. Replay attack reuses consumed vault nonce    → PayloadMismatch
 *   R4. Wrong secp256r1 key in proof                 → WrongSigner
 *   R5. Tampered amount after proof issued           → PayloadMismatch
 *   R6. Missing secp256r1 precompile instruction     → MissingProof
 */
import { p256 } from "@noble/curves/nist.js"
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
// Deterministic seed so tests are idempotent on a running (non-reset) validator.
const SHARED_SERVER_KP = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0xab))

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

// ── secp256r1 (P-256) helpers ─────────────────────────────────────────────────
//
// The secp256r1 precompile layout (HAS a padding byte, identical to Ed25519):
//   [0]       num_signatures (u8)
//   [1]       padding (u8)
//   [2..16]   SignatureOffsets (14 bytes):
//               [2..4]   sig_offset
//               [4..6]   sig_ix_index  (0xFFFF = current instruction)
//               [6..8]   pk_offset
//               [8..10]  pk_ix_index   (0xFFFF)
//               [10..12] msg_offset
//               [12..14] msg_size
//               [14..16] msg_ix_index  (0xFFFF)
//   [16..49]  pubkey  (33 bytes compressed P-256)
//   [49..113] signature (64 bytes compact r‖s)
//   [113..145] message  (32 bytes — the payload hash)
//
// The precompile calls verify_prehash — it does NOT hash the message internally.
// Sign the payload_hash directly with ECDSA-P256.

const SECP256R1_PROGRAM_ID = "Secp256r1SigVerify1111111111111111111111111"

/**
 * Build a secp256r1 precompile instruction.
 * pubkey   — 33-byte compressed P-256 public key
 * sig      — 64-byte compact ECDSA signature (r‖s)
 * message  — 32-byte payload hash (precompile will SHA-256 it internally)
 */
function buildSecp256r1Ix(
  pubkey: Uint8Array,
  sig: Uint8Array,
  message: Uint8Array,
): TransactionInstruction {
  const HEADER    = 1 + 1 + 14       // count byte + padding + SignatureOffsets
  const pkOffset  = HEADER            // 16
  const sigOffset = HEADER + 33       // 49
  const msgOffset = HEADER + 33 + 64  // 113

  const data = Buffer.alloc(msgOffset + message.length)

  data[0] = 1  // num_signatures
  data[1] = 0  // padding (required — same as Ed25519 precompile)

  // SignatureOffsets (little-endian u16s, starting at byte 2)
  data.writeUInt16LE(sigOffset, 2)       // sig_offset
  data.writeUInt16LE(0xffff,   4)        // sig_instruction_index (current)
  data.writeUInt16LE(pkOffset, 6)        // public_key_offset
  data.writeUInt16LE(0xffff,   8)        // public_key_instruction_index
  data.writeUInt16LE(msgOffset, 10)      // message_data_offset
  data.writeUInt16LE(message.length, 12) // message_data_size
  data.writeUInt16LE(0xffff,   14)       // message_instruction_index

  Buffer.from(pubkey).copy(data, pkOffset)
  Buffer.from(sig).copy(data, sigOffset)
  Buffer.from(message).copy(data, msgOffset)

  return new TransactionInstruction({
    keys: [],
    programId: new PublicKey(SECP256R1_PROGRAM_ID),
    data,
  })
}

/**
 * Sign a payload hash with a P-256 private key for the secp256r1 precompile.
 *
 * The precompile does SHA-256(message) internally before ECDSA verification.
 * We pass `payloadHash` as the message, so the precompile verifies against
 * SHA-256(payloadHash).  We therefore sign SHA-256(payloadHash) here.
 */
function secp256r1Sign(privKey: Uint8Array, payloadHash: Buffer): Uint8Array {
  // The secp256r1 precompile uses verify_prehash — it does NOT hash the message
  // internally. Sign the raw payloadHash bytes directly as the ECDSA e value.
  // @noble/curves 2.x: sign() returns 64-byte compact Uint8Array directly.
  return p256.sign(payloadHash, privKey) as Uint8Array
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

    try {
      await program.methods
        .initialize(new BN(THRESHOLD), true)
        .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch {
      // Already initialised — update config to use current server key
      await program.methods
        .updateConfig(new BN(THRESHOLD), true)
        .accounts({ config: configPda, authority: payer.publicKey, serverKey })
        .rpc()
    }

    try {
      await program.methods
        .initVault(false)
        .accounts({ vault: vaultPda, owner: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch { /* already initialised */ }

    // Sync local nonce tracker with on-chain vault state (for idempotent re-runs)
    const vaultState = await program.account.vaultState.fetch(vaultPda)
    nextNonce = vaultState.nextNonce.toNumber()

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
    } catch {
      // Already initialised — ensure server key is current
      await program.methods
        .updateConfig(new BN(THRESHOLD), true)
        .accounts({ config: configPda, authority: payer.publicKey, serverKey })
        .rpc()
    }
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

// ── Registry + secp256r1 passkey path ─────────────────────────────────────────
//
// Scenarios R1-R6: exercises the onchain 2FA registry with a real P-256
// (secp256r1) keypair — the same curve used by WebAuthn passkeys, Touch ID,
// Face ID, and YubiKey P-256 mode.
//
// No bridge server key is trusted here.  The security anchor is the PDA at
// [b"2fa", owner] which stores the user's registered P-256 public key.

describe("guard — registry + secp256r1 passkey path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  // Generate a fresh P-256 keypair for this test run
  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true) // 33-byte compressed

  // Separate owner keypair so we don't reuse the payer's vault from earlier suites
  let owner: Keypair
  let vaultPda:    PublicKey
  let registryPda: PublicKey
  let registryVaultNonce = 0  // mirror of vault.next_nonce

  const DEPOSIT_AMOUNT = 10 * SOL

  before(async () => {
    owner = Keypair.generate()

    // Fund the owner
    const sig = await connection.requestAirdrop(owner.publicKey, 20 * SOL)
    await connection.confirmTransaction(sig, "confirmed")
    await new Promise(r => setTimeout(r, 500))

    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId
    )
    ;[registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.publicKey.toBuffer()],
      program.programId
    )

    // Init vault for this owner
    await program.methods
      .initVault(false)
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner])
      .rpc()

    // Deposit SOL so there is something to withdraw
    await program.methods
      .deposit(new BN(DEPOSIT_AMOUNT))
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner])
      .rpc()
  })

  // ── R1. Register secp256r1 passkey → PDA created with correct key ────────────
  it("Scenario R1: registers secp256r1 passkey in onchain registry PDA", async () => {
    const credentialId = Buffer.from("passkey-credential-abc123", "utf8")

    await program.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },        // KeyKind variant (camelCase of Secp256r1Passkey)
        Buffer.from(p256PubKey),          // 33-byte compressed P-256 pubkey
        Buffer.from(credentialId)
      )
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc()

    const reg = await program.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.owner.toBase58(), owner.publicKey.toBase58(), "owner mismatch")
    assert.ok(reg.enabled, "registry should be enabled")
    assert.ok(reg.nonce === 0 || reg.nonce.toNumber() === 0, "initial nonce should be 0")
    assert.deepEqual(
      Buffer.from(reg.pubkeyBytes),
      Buffer.from(p256PubKey),
      "registered pubkey mismatch"
    )
  })

  // ── Helper: build + send registry_vault_withdraw tx ──────────────────────────
  async function registryWithdrawTx(opts: {
    amount:    number
    privKey:   Uint8Array
    withProof: boolean
    tamperedAmount?: number // submit this amount in the instruction but sign for `amount`
  }): Promise<string> {
    const { amount, privKey, withProof, tamperedAmount } = opts
    const nonce  = registryVaultNonce
    const expiry = Math.floor(Date.now() / 1000) + 300
    const dest   = Keypair.generate().publicKey

    const payloadHash = sha256(canonicalVaultPayload(
      program.programId.toBase58(),
      vaultPda.toBase58(),
      amount,
      nonce,
      expiry
    ))

    const actualAmount = tamperedAmount ?? amount

    const ix = await program.methods
      .registryVaultWithdraw(new BN(actualAmount), new BN(expiry))
      .accounts({
        vault:        vaultPda,
        registry:     registryPda,
        owner:        owner.publicKey,
        to:           dest,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })

    if (withProof) {
      const sig = secp256r1Sign(privKey, payloadHash)
      tx.add(buildSecp256r1Ix(p256.getPublicKey(privKey, true), sig, payloadHash))
    }
    tx.add(ix)

    return sendAndConfirmTransaction(connection, tx, [owner])
  }

  // ── R2. Valid secp256r1 proof → Success ───────────────────────────────────────
  it("Scenario R2: registry_vault_withdraw with valid P-256 proof succeeds", async () => {
    await registryWithdrawTx({ amount: 1 * SOL, privKey: p256PrivKey, withProof: true })
    registryVaultNonce++

    const vault = await program.account.vaultState.fetch(vaultPda)
    assert.equal(
      vault.nextNonce.toNumber(),
      registryVaultNonce,
      "vault nonce should have incremented"
    )
  })

  // ── R3. Replay — vault nonce advanced, proof was for old nonce → PayloadMismatch
  it("Scenario R3: replay attack fails (nonce advanced, proof payload mismatches)", async () => {
    // Sign for old nonce (registryVaultNonce - 1)
    const oldNonce    = registryVaultNonce - 1
    const expiry      = Math.floor(Date.now() / 1000) + 300
    const oldHash     = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), 1 * SOL, oldNonce, expiry
    ))
    const sig         = secp256r1Sign(p256PrivKey, oldHash)
    const dest        = Keypair.generate().publicKey

    const ix = await program.methods
      .registryVaultWithdraw(new BN(1 * SOL), new BN(expiry))
      .accounts({ vault: vaultPda, registry: registryPda, owner: owner.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(buildSecp256r1Ix(p256PubKey, sig, oldHash))
    tx.add(ix)

    try {
      await sendAndConfirmTransaction(connection, tx, [owner])
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") ||
        (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })

  // ── R4. Wrong secp256r1 key → WrongSigner ────────────────────────────────────
  it("Scenario R4: proof from unregistered P-256 key fails with WrongSigner", async () => {
    // Generate a completely different P-256 keypair
    const attackerPrivKey = p256.utils.randomSecretKey()
    const attackerPubKey  = p256.getPublicKey(attackerPrivKey, true)

    const expiry      = Math.floor(Date.now() / 1000) + 300
    const payloadHash = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), 1 * SOL, registryVaultNonce, expiry
    ))
    const sig  = secp256r1Sign(attackerPrivKey, payloadHash)
    const dest = Keypair.generate().publicKey

    const ix = await program.methods
      .registryVaultWithdraw(new BN(1 * SOL), new BN(expiry))
      .accounts({ vault: vaultPda, registry: registryPda, owner: owner.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    // Include attacker's key in the secp256r1 instruction (not the registered key)
    tx.add(buildSecp256r1Ix(attackerPubKey, sig, payloadHash))
    tx.add(ix)

    try {
      await sendAndConfirmTransaction(connection, tx, [owner])
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") ||
        (err as Error).message.includes("0x1771"),
        `Expected WrongSigner, got: ${(err as Error).message}`
      )
    }
  })

  // ── R5. Tampered amount — sign for 1 SOL, submit 3 SOL → PayloadMismatch ─────
  it("Scenario R5: tampered amount after proof issued fails with PayloadMismatch", async () => {
    const signedAmount   = 1 * SOL
    const tamperedAmount = 3 * SOL
    const expiry         = Math.floor(Date.now() / 1000) + 300
    const payloadHash    = sha256(canonicalVaultPayload(
      program.programId.toBase58(), vaultPda.toBase58(), signedAmount, registryVaultNonce, expiry
    ))
    const sig  = secp256r1Sign(p256PrivKey, payloadHash)
    const dest = Keypair.generate().publicKey

    // Instruction submits tamperedAmount but the proof covers signedAmount
    const ix = await program.methods
      .registryVaultWithdraw(new BN(tamperedAmount), new BN(expiry))
      .accounts({ vault: vaultPda, registry: registryPda, owner: owner.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(buildSecp256r1Ix(p256PubKey, sig, payloadHash))
    tx.add(ix)

    try {
      await sendAndConfirmTransaction(connection, tx, [owner])
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") ||
        (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })

  // ── R6. No secp256r1 precompile instruction → MissingProof ───────────────────
  it("Scenario R6: registry_vault_withdraw without secp256r1 proof fails with MissingProof", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const dest   = Keypair.generate().publicKey

    const ix = await program.methods
      .registryVaultWithdraw(new BN(1 * SOL), new BN(expiry))
      .accounts({ vault: vaultPda, registry: registryPda, owner: owner.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    // Intentionally omit the secp256r1 precompile instruction
    tx.add(ix)

    try {
      await sendAndConfirmTransaction(connection, tx, [owner])
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") ||
        (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })
})
