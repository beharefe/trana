/**
 * Anchor test suite for the Transaction Authorization Guard.
 *
 * Tests three instruction paths:
 *   A. vault_withdraw       — vault PDA, Config server key, Ed25519 proof (legacy)
 *   B. protected_transfer   — direct SOL, random nonce, Ed25519 proof (legacy)
 *   C. registry_vault_withdraw — vault PDA, onchain 2FA registry, secp256r1/WebAuthn proof
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
 *   R2. registry_vault_withdraw with valid proof     → Success, registry.nonce → 1
 *   R3. Replay: reuse old proof (nonce=0 consumed)   → PayloadMismatch
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

// ── Shared state ──────────────────────────────────────────────────────────────

const SHARED_SERVER_KP = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0xab))

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOL = 1_000_000_000

function sha256(data: Buffer | Uint8Array | string): Buffer {
  return createHash("sha256").update(data).digest()
}

function canonicalPayload(
  programId: string,
  amount: number,
  nonce: string,
  expiry: number
): string {
  return JSON.stringify({ programId, instruction: "transfer", amount, nonce, expiry })
}

function canonicalVaultPayload(
  programId: string,
  vault: string,
  amount: number,
  nonce: number,
  expiry: number
): string {
  return JSON.stringify({ programId, instruction: "vault_withdraw", vault, amount, nonce, expiry })
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

// ── secp256r1 instruction builder ─────────────────────────────────────────────
//
// Layout (SIMD-0075):
//   [0]       num_signatures (u8 = 1)
//   [1]       padding (u8 = 0)
//   [2..16]   SignatureOffsets (7 × u16-LE = 14 bytes)
//   [16..49]  pubkey  (33 bytes compressed P-256)
//   [49..113] signature (64 bytes compact r‖s)
//   [113..145] message (32 bytes — the WebAuthn e-value prehash)

const SECP256R1_PROGRAM_ID = "Secp256r1SigVerify1111111111111111111111111"

function buildSecp256r1Ix(
  pubkey:  Uint8Array,  // 33-byte compressed
  sig:     Uint8Array,  // 64-byte compact (r‖s)
  message: Uint8Array,  // 32-byte e-value
): TransactionInstruction {
  const pkOffset  = 16
  const sigOffset = 49
  const msgOffset = 113

  const data = Buffer.alloc(msgOffset + message.length)
  data[0] = 1  // num_signatures
  data[1] = 0  // padding

  data.writeUInt16LE(sigOffset,       2)
  data.writeUInt16LE(0xffff,          4)
  data.writeUInt16LE(pkOffset,        6)
  data.writeUInt16LE(0xffff,          8)
  data.writeUInt16LE(msgOffset,       10)
  data.writeUInt16LE(message.length,  12)
  data.writeUInt16LE(0xffff,          14)

  Buffer.from(pubkey).copy(data,   pkOffset)
  Buffer.from(sig).copy(data,      sigOffset)
  Buffer.from(message).copy(data,  msgOffset)

  return new TransactionInstruction({
    keys:      [],
    programId: new PublicKey(SECP256R1_PROGRAM_ID),
    data,
  })
}

// ── Intent hash (mirrors TypeScript SDK's hashIntent) ─────────────────────────
//
// Canonical binary encoding — must match programs/guard/src/lib.rs exactly.
// Length prefixes are u16-LE (2 bytes). Integers are little-endian.

function computeIntentHash(
  domain:           string,    // "trana:v1"
  cluster:          string,    // "localnet" | "devnet" | "mainnet-beta"
  wallet:           PublicKey,
  guardProgramId:   PublicKey,
  targetProgramId:  PublicKey,
  policyId:         string,
  discriminator:    Buffer,    // 8 bytes
  accountsHash:     Buffer,    // 32 bytes
  paramsHash:       Buffer,    // 32 bytes
  nonce:            number,
  expiry:           number,
): Buffer {
  const u16LE = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
  const u64LE = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
  const i64LE = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b }

  const domainB  = Buffer.from(domain)
  const clusterB = Buffer.from(cluster)
  const policyB  = Buffer.from(policyId)

  const payload = Buffer.concat([
    Buffer.from([1]),               // version u8
    u16LE(domainB.length),  domainB,
    u16LE(clusterB.length), clusterB,
    wallet.toBuffer(),
    guardProgramId.toBuffer(),
    targetProgramId.toBuffer(),
    u16LE(policyB.length),  policyB,
    discriminator,           // 8 bytes
    accountsHash,            // 32 bytes
    paramsHash,              // 32 bytes
    u64LE(nonce),
    i64LE(expiry),
  ])

  return sha256(payload)
}

// ── WebAuthn proof builder ────────────────────────────────────────────────────
//
// Constructs minimal but structurally valid WebAuthn data:
//   authenticatorData: 37 bytes (rpIdHash[32] + flags[1] + counter[4])
//   clientDataJSON:    {"type":"webauthn.get","challenge":"<base64url(intentHash)>",...}
//
// ECDSA e-value = SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
// The secp256r1 precompile uses verify_prehash — the message IS the e-value.

function buildWebAuthnProof(
  intentHash: Buffer,
  privKey:    Uint8Array,
  rpId = "localhost"
): { authData: Buffer; clientDataJSON: Buffer; eValue: Buffer; sig: Uint8Array } {
  // 37-byte authenticatorData: rpIdHash(32) + flags(1) + counter(4)
  const rpIdHash = sha256(Buffer.from(rpId))
  const authData = Buffer.alloc(37)
  rpIdHash.copy(authData, 0)
  authData[32] = 0x05 // UP (bit 0) + UV (bit 2) — user present + verified

  // clientDataJSON with challenge = base64url(intentHash)
  const clientDataJSON = Buffer.from(JSON.stringify({
    type:        "webauthn.get",
    challenge:   intentHash.toString("base64url"),
    origin:      `http://${rpId}`,
    crossOrigin: false,
  }))

  // e-value = SHA-256(authData ‖ SHA-256(clientDataJSON))
  const clientDataHash = sha256(clientDataJSON)
  const eValue = sha256(Buffer.concat([authData, clientDataHash]))

  // Sign e-value directly — p256.sign() treats msg as prehash (verify_prehash mode)
  // This version of @noble/curves returns a Uint8Array directly (no .toCompactRawBytes())
  const sig = Uint8Array.from(p256.sign(eValue, privKey))

  return { authData, clientDataJSON, eValue, sig }
}

// ── Test suite: vault_withdraw (Ed25519 bridge, scenarios 1-5) ────────────────

describe("guard — vault path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  const serverKp  = SHARED_SERVER_KP
  const serverKey = new PublicKey(serverKp.publicKey)

  const THRESHOLD  = 20 * SOL
  const ABOVE      = 30 * SOL
  const BELOW      = 5  * SOL
  const FUND_VAULT = 50 * SOL

  let configPda: PublicKey
  let vaultPda:  PublicKey
  let nextNonce  = 0

  before(async () => {
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], program.programId
    )
    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), payer.publicKey.toBuffer()], program.programId
    )

    try {
      await program.methods
        .initialize(new BN(THRESHOLD), true)
        .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch {
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

    const vaultState = await program.account.vaultState.fetch(vaultPda)
    nextNonce = vaultState.nextNonce.toNumber()

    await program.methods
      .deposit(new BN(FUND_VAULT))
      .accounts({ vault: vaultPda, owner: payer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()
  })

  async function vaultWithdrawTx(
    amount: number, nonce: number, payloadHash: Buffer, expiry: number, withProof: boolean
  ): Promise<string> {
    const dest = Keypair.generate().publicKey
    const ix = await program.methods
      .vaultWithdraw(new BN(amount), new BN(nonce), Array.from(payloadHash), new BN(expiry))
      .accounts({ config: configPda, vault: vaultPda, owner: payer.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
    if (withProof) tx.add(buildVerifyIx(serverKp, payloadHash))
    tx.add(ix)
    return sendAndConfirmTransaction(connection, tx, [payer.payer])
  }

  it("Scenario 1: attacker without proof fails with MissingProof", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry))
    try {
      await vaultWithdrawTx(ABOVE, nextNonce, hash, expiry, false)
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })

  it("Scenario 2: small withdrawal succeeds without proof", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(program.programId.toBase58(), vaultPda.toBase58(), BELOW, nextNonce, expiry))
    await vaultWithdrawTx(BELOW, nextNonce, hash, expiry, false)
    nextNonce++
  })

  it("Scenario 3: large withdrawal with valid proof succeeds", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalVaultPayload(program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry))
    await vaultWithdrawTx(ABOVE, nextNonce, hash, expiry, true)
    nextNonce++
  })

  it("Scenario 4: replay attack fails with InvalidNonce", async () => {
    const oldNonce = nextNonce - 1
    const expiry   = Math.floor(Date.now() / 1000) + 300
    const hash     = sha256(canonicalVaultPayload(program.programId.toBase58(), vaultPda.toBase58(), ABOVE, oldNonce, expiry))
    try {
      await vaultWithdrawTx(ABOVE, oldNonce, hash, expiry, true)
      assert.fail("Expected InvalidNonce")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("InvalidNonce") || (err as Error).message.includes("0x1773"),
        `Expected InvalidNonce, got: ${(err as Error).message}`
      )
    }
  })

  it("Scenario 5: tampered amount fails with PayloadMismatch", async () => {
    const expiry   = Math.floor(Date.now() / 1000) + 300
    const realHash = sha256(canonicalVaultPayload(program.programId.toBase58(), vaultPda.toBase58(), ABOVE, nextNonce, expiry))
    try {
      await vaultWithdrawTx(ABOVE + SOL, nextNonce, realHash, expiry, true)
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })
})

// ── Test suite: protected_transfer (Ed25519 bridge, scenarios 6-9) ────────────

describe("guard — protected_transfer path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  const serverKp  = SHARED_SERVER_KP
  const serverKey = new PublicKey(serverKp.publicKey)

  const THRESHOLD = 20 * SOL
  const ABOVE     = 30 * SOL
  const BELOW     = 10 * SOL

  let configPda:      PublicKey
  let scenario8Nonce: Buffer

  before(async () => {
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], program.programId
    )
    try {
      await program.methods
        .initialize(new BN(THRESHOLD), true)
        .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch {
      await program.methods
        .updateConfig(new BN(THRESHOLD), true)
        .accounts({ config: configPda, authority: payer.publicKey, serverKey })
        .rpc()
    }
  })

  async function protectedTransferTx(
    amount: number, nonce: Buffer, payloadHash: Buffer, expiry: number,
    optIn: boolean, withProof: boolean
  ): Promise<string> {
    const [noncePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), nonce], program.programId
    )
    const to = Keypair.generate().publicKey
    const ix = await program.methods
      .protectedTransfer(new BN(amount), Array.from(nonce), Array.from(payloadHash), new BN(expiry), optIn)
      .accounts({ config: configPda, nonceAccount: noncePda, from: payer.publicKey, to, instructions: SYSVAR_INSTRUCTIONS_PUBKEY, systemProgram: SystemProgram.programId })
      .instruction()

    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey })
    if (withProof) tx.add(buildVerifyIx(serverKp, payloadHash))
    tx.add(ix)
    return sendAndConfirmTransaction(connection, tx, [payer.payer])
  }

  it("Scenario 6: small transfer succeeds without proof", async () => {
    const { bytes, hex } = makeNonce32()
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), BELOW, hex, expiry))
    await protectedTransferTx(BELOW, bytes, hash, expiry, false, false)
  })

  it("Scenario 7: large transfer without proof fails with MissingProof", async () => {
    const { bytes, hex } = makeNonce32()
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))
    try {
      await protectedTransferTx(ABOVE, bytes, hash, expiry, false, false)
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })

  it("Scenario 8: large transfer with valid proof succeeds", async () => {
    const { bytes, hex } = makeNonce32()
    scenario8Nonce = bytes
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))
    await protectedTransferTx(ABOVE, bytes, hash, expiry, false, true)
  })

  it("Scenario 9: replay of used nonce fails with NonceAlreadyUsed", async () => {
    const hex    = scenario8Nonce.toString("hex")
    const expiry = Math.floor(Date.now() / 1000) + 300
    const hash   = sha256(canonicalPayload(program.programId.toBase58(), ABOVE, hex, expiry))
    try {
      await protectedTransferTx(ABOVE, scenario8Nonce, hash, expiry, false, true)
      assert.fail("Expected NonceAlreadyUsed")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("NonceAlreadyUsed") || (err as Error).message.includes("0x1775"),
        `Expected NonceAlreadyUsed, got: ${(err as Error).message}`
      )
    }
  })
})

// ── Test suite: registry + secp256r1 passkey (scenarios R1-R6) ────────────────
//
// Exercises the onchain 2FA registry with a real P-256 keypair.
// No bridge server key — the security anchor is the registry PDA.
//
// Proof structure:
//   secp256r1 instruction message = WebAuthn e-value (32 bytes)
//   e-value = SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
//   clientDataJSON.challenge = base64url(intentHash)
//   intentHash = SHA-256(canonical encoding of all intent fields)
//
// Replay protection: registry.nonce is consumed (incremented) on every
// successful proof verification. Old proofs fail PayloadMismatch.

describe("guard — registry + secp256r1 passkey path", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const program    = workspace.Guard as Program<Guard>
  const connection = provider.connection
  const payer      = provider.wallet as pkg.Wallet

  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true) // 33-byte compressed

  let owner:        Keypair
  let vaultPda:     PublicKey
  let registryPda:  PublicKey
  let registryNonce = 0  // mirrors registry.nonce (incremented on each successful proof)

  const DEPOSIT_AMOUNT = 10 * SOL

  // Anchor discriminator for registry_vault_withdraw = SHA-256("global:registry_vault_withdraw")[0..8]
  const RVW_DISCRIMINATOR = sha256(Buffer.from("global:registry_vault_withdraw")).slice(0, 8)

  before(async () => {
    owner = Keypair.generate()

    const sig = await connection.requestAirdrop(owner.publicKey, 20 * SOL)
    await connection.confirmTransaction(sig, "confirmed")
    await new Promise(r => setTimeout(r, 500))

    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()], program.programId
    )
    ;[registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.publicKey.toBuffer()], program.programId
    )

    await program.methods
      .initVault(false)
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner])
      .rpc()

    await program.methods
      .deposit(new BN(DEPOSIT_AMOUNT))
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner])
      .rpc()
  })

  // ── R1. Register passkey ────────────────────────────────────────────────────
  it("Scenario R1: registers secp256r1 passkey in onchain registry PDA", async () => {
    const credentialId = Buffer.from("passkey-credential-abc123", "utf8")

    await program.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(p256PubKey),
        Buffer.from(credentialId)
      )
      .accounts({ registry: registryPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner])
      .rpc()

    const reg = await program.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.owner.toBase58(), owner.publicKey.toBase58(), "owner mismatch")
    assert.ok(reg.enabled, "registry should be enabled")
    assert.ok(reg.nonce === 0 || reg.nonce.toNumber() === 0, "initial nonce should be 0")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(p256PubKey), "registered pubkey mismatch")
  })

  // ── Helper: build + send registry_vault_withdraw tx ──────────────────────────
  async function registryWithdrawTx(opts: {
    amount:         number
    privKey:        Uint8Array
    withProof:      boolean
    tamperedAmount?: number  // submit this amount in the instruction but sign for `amount`
    useNonce?:       number  // override nonce for replay tests (defaults to registryNonce)
  }): Promise<string> {
    const { amount, privKey, withProof, tamperedAmount } = opts
    const nonceToSign  = opts.useNonce !== undefined ? opts.useNonce : registryNonce
    const actualAmount = tamperedAmount ?? amount
    const expiry       = Math.floor(Date.now() / 1000) + 300
    const dest         = Keypair.generate().publicKey
    const cluster      = "localnet"

    // accounts_hash = SHA-256(vault_pda ‖ dest)
    const accountsHash = sha256(Buffer.concat([vaultPda.toBuffer(), dest.toBuffer()]))

    // params_hash = SHA-256(amount as u64 LE)
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))  // sign for `amount`, not tamperedAmount
    const paramsHash = sha256(amountBuf)

    // Compute intent hash (used as WebAuthn challenge)
    const intentHash = computeIntentHash(
      "trana:v1", cluster,
      owner.publicKey, program.programId, program.programId,  // target = guard (vault is internal)
      "VaultWithdraw", RVW_DISCRIMINATOR,
      accountsHash, paramsHash,
      nonceToSign, expiry
    )

    // Build WebAuthn proof
    const { authData, clientDataJSON, eValue, sig } = buildWebAuthnProof(intentHash, privKey)
    const pubKeyToUse = p256.getPublicKey(privKey, true)

    // Build instruction — pass Vec<u8> args as Buffer, not Array.from() (Borsh encoder requires Buffer)
    const ix = await program.methods
      .registryVaultWithdraw(
        new BN(actualAmount),
        new BN(expiry),
        cluster,
        authData,
        clientDataJSON
      )
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
      tx.add(buildSecp256r1Ix(pubKeyToUse, sig, eValue))
    }
    tx.add(ix)

    return sendAndConfirmTransaction(connection, tx, [owner])
  }

  // ── R2. Valid proof → Success, registry.nonce increments ─────────────────────
  it("Scenario R2: registry_vault_withdraw with valid P-256 proof succeeds", async () => {
    await registryWithdrawTx({ amount: 1 * SOL, privKey: p256PrivKey, withProof: true })
    registryNonce++

    const reg = await program.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(
      reg.nonce.toNumber(), registryNonce,
      "registry.nonce should have incremented"
    )
  })

  // ── R3. Replay — proof was for nonce=0, registry.nonce is now 1 ──────────────
  it("Scenario R3: replay attack fails (old nonce already consumed)", async () => {
    // Build a proof with the old nonce (0) — but registry.nonce is now 1
    // Program computes intentHash with nonce=1; challenge encodes nonce=0 → mismatch
    const oldNonce = registryNonce - 1

    try {
      await registryWithdrawTx({
        amount:    1 * SOL,
        privKey:   p256PrivKey,
        withProof: true,
        useNonce:  oldNonce,
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })

  // ── R4. Wrong secp256r1 key → WrongSigner ────────────────────────────────────
  it("Scenario R4: proof from unregistered P-256 key fails with WrongSigner", async () => {
    const attackerPrivKey = p256.utils.randomSecretKey()

    try {
      await registryWithdrawTx({
        amount:    1 * SOL,
        privKey:   attackerPrivKey,  // attacker's key — not registered
        withProof: true,
      })
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") || (err as Error).message.includes("0x1771"),
        `Expected WrongSigner, got: ${(err as Error).message}`
      )
    }
  })

  // ── R5. Tampered amount → PayloadMismatch ────────────────────────────────────
  it("Scenario R5: tampered amount after proof issued fails with PayloadMismatch", async () => {
    // Proof signed for 1 SOL; instruction submits 3 SOL
    // Program computes paramsHash from 3 SOL, but challenge encodes 1 SOL → mismatch
    try {
      await registryWithdrawTx({
        amount:         1 * SOL,
        privKey:        p256PrivKey,
        withProof:      true,
        tamperedAmount: 3 * SOL,
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`
      )
    }
  })

  // ── R6. No secp256r1 precompile → MissingProof ───────────────────────────────
  it("Scenario R6: registry_vault_withdraw without secp256r1 proof fails with MissingProof", async () => {
    try {
      await registryWithdrawTx({
        amount:    1 * SOL,
        privKey:   p256PrivKey,
        withProof: false,  // intentionally omit secp256r1 instruction
      })
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`
      )
    }
  })
})
