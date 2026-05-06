/**
 * Trana Guard — core authorization test suite.
 *
 * Scenarios:
 *   R1.  Passkey registered in onchain PDA                       → Success
 *   R2.  Withdraw with valid P-256 proof                         → Success, nonce → 1
 *   R3.  Replay: reuse old proof (nonce=0 consumed)              → PayloadMismatch
 *   R4.  Wrong secp256r1 key in proof                            → WrongSigner
 *   R5.  Tampered amount after proof issued                      → PayloadMismatch
 *   R6.  Missing secp256r1 precompile instruction                → MissingProof
 *   R7.  Simulate-first flow: detect policy from logs, then prove → Success
 *   R8.  2 s passkey delay — fresh blockhash                     → Success
 *   R9.  5 s passkey delay — fresh blockhash                     → Success
 *   R10. Expired proof (expiry < now)                            → ProofExpired
 *   R11. Wrong cluster in record_proof                           → ClusterMismatch
 *   R12. Wrong policy string in record_proof                     → PolicyMismatch
 *   R13. Registration fee charged on first register              → +REGISTER_FEE in treasury
 *   R14. Recovery fee charged on re-registration                 → +RECOVERY_FEE in treasury
 *   R15. update_config by non-authority                          → Unauthorized
 *   R22. Policy::NotBefore fires (far-future slot, no proof)     → MissingProof
 *  R22b. Policy::NotBefore passes (slot 0 already reached)       → Success (no proof)
 *  R22c. Policy::NotBefore fires (far-future slot, with proof)   → Success
 *   R23. Policy::NotAfter fires (slot 0 already elapsed, no proof) → MissingProof
 *  R23b. Policy::NotAfter passes (far-future slot)               → Success (no proof)
 *  R23c. Policy::NotAfter fires (slot 0 already elapsed, with proof) → Success
 *   R18. Policy::Limit does not fire below threshold               → Success (no proof)
 *   R19. Re-registration preserves nonce, updates pubkey          → Success
 *   R24. ComputeBudget prepended — secp256r1 still found at N-2   → Success
 *   R25. Two protected instructions in one tx (nonces N, N+1)     → Success (nonce +2)
 *   R26. V0 transaction with address lookup table                 → Success
 */

import { p256 } from "@noble/curves/nist.js"
import pkg from "@coral-xyz/anchor"
const { BN, AnchorProvider, workspace, setProvider } = pkg
type Program<T extends pkg.Idl> = pkg.Program<T>
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { createHash } from "crypto"
import assert from "assert"
import type { Trana }    from "../target/types/trana"
import type { DemoVault } from "../target/types/demo_vault"
import { parsePolicyFromLogs } from "../packages/sdk/src/react/detector"

// ── Constants ─────────────────────────────────────────────────────────────────

const SOL          = 1_000_000_000
const REGISTER_FEE = 5_000_000   // 0.005 SOL
const RECOVERY_FEE = 10_000_000  // 0.01  SOL

// demo_vault::withdraw discriminator
const WITHDRAW_DISC = Buffer.from([0xb7, 0x12, 0x46, 0x9c, 0x94, 0x6d, 0xa1, 0x22])

// ── Crypto helpers ────────────────────────────────────────────────────────────

function sha256(data: Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── secp256r1 instruction builder (SIMD-0075) ─────────────────────────────────

function buildSecp256r1Ix(
  pubkey:  Uint8Array,
  sig:     Uint8Array,
  message: Uint8Array,
): TransactionInstruction {
  const pkOffset  = 16
  const sigOffset = 49
  const msgOffset = 113
  const data = Buffer.alloc(msgOffset + message.length)
  data[0] = 1; data[1] = 0
  data.writeUInt16LE(sigOffset,      2)
  data.writeUInt16LE(0xffff,         4)
  data.writeUInt16LE(pkOffset,       6)
  data.writeUInt16LE(0xffff,         8)
  data.writeUInt16LE(msgOffset,      10)
  data.writeUInt16LE(message.length, 12)
  data.writeUInt16LE(0xffff,         14)
  Buffer.from(pubkey).copy(data, pkOffset)
  Buffer.from(sig).copy(data,   sigOffset)
  Buffer.from(message).copy(data, msgOffset)
  return new TransactionInstruction({
    keys: [], programId: new PublicKey("Secp256r1SigVerify1111111111111111111111111"), data,
  })
}

// ── record_proof instruction builder ─────────────────────────────────────────

function buildRecordProofIx(
  tranaProgramId: PublicKey,
  version:        number,
  expiry:         number,
  cluster:        string,
  policy:         string,
  authData:       Buffer,
  clientDataJSON: Buffer,
): TransactionInstruction {
  const disc   = sha256(Buffer.from("global:record_proof")).slice(0, 8)
  const u32le  = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const bStr   = (s: string) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
  const bBytes = (b: Buffer)  => Buffer.concat([u32le(b.length), b])
  const expiryBuf = Buffer.alloc(8)
  expiryBuf.writeBigInt64LE(BigInt(expiry))
  const data = Buffer.concat([
    disc, Buffer.from([version]), expiryBuf,
    bStr(cluster), bStr(policy), bBytes(authData), bBytes(clientDataJSON),
  ])
  return new TransactionInstruction({
    keys: [{ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }],
    programId: tranaProgramId, data,
  })
}

// ── Intent hash ───────────────────────────────────────────────────────────────

function computeIntentHash(
  domain:          string,
  cluster:         string,
  wallet:          PublicKey,
  guardProgramId:  PublicKey,
  targetProgramId: PublicKey,
  policy:          string,
  discriminator:   Buffer,
  accountsHash:    Buffer,
  paramsHash:      Buffer,
  nonce:           number,
  expiry:          number,
): Buffer {
  const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
  const u64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
  const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b }
  const d = Buffer.from(domain), cl = Buffer.from(cluster), p = Buffer.from(policy)
  return sha256(Buffer.concat([
    Buffer.from([1]),
    u16le(d.length),  d,
    u16le(cl.length), cl,
    wallet.toBuffer(), guardProgramId.toBuffer(), targetProgramId.toBuffer(),
    u16le(p.length),  p,
    discriminator, accountsHash, paramsHash,
    u64le(nonce), i64le(expiry),
  ]))
}

// ── WebAuthn proof builder ────────────────────────────────────────────────────

function buildWebAuthnProof(
  intentHash: Buffer,
  privKey:    Uint8Array,
  rpId = "localhost",
): { authData: Buffer; clientDataJSON: Buffer; rawMsg: Buffer; sig: Uint8Array } {
  const authData = Buffer.alloc(37)
  sha256(Buffer.from(rpId)).copy(authData, 0)
  authData[32] = 0x05
  const clientDataJSON = Buffer.from(JSON.stringify({
    type:        "webauthn.get",
    challenge:   intentHash.toString("base64url"),
    origin:      `http://${rpId}`,
    crossOrigin: false,
  }))
  const rawMsg = Buffer.concat([authData, sha256(clientDataJSON)])
  const sig    = Uint8Array.from(p256.sign(rawMsg, privKey))
  return { authData, clientDataJSON, rawMsg, sig }
}

// ── Borsh helpers (for paramsHash computation in enforce-as-self tests) ──────

const u64LEbig = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b }

function borshU64Policy(variantIndex: number, value: bigint): Buffer {
  return Buffer.concat([Buffer.from([variantIndex]), u64LEbig(value)])
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("guard — secp256r1 passkey enforcement", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const trana = workspace.Trana    as Program<Trana>
  const vault = workspace.DemoVault as Program<DemoVault>
  const conn  = provider.connection
  const payer = provider.wallet as pkg.Wallet

  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true)

  let owner:          Keypair
  let vaultPda:       PublicKey
  let registryPda:    PublicKey
  let configPda:      PublicKey
  let treasuryPubkey: PublicKey   // receives registration fees
  let registryNonce = 0

  beforeAll(async () => {
    owner = Keypair.generate()

    const sig = await conn.requestAirdrop(owner.publicKey, 20 * SOL)
    await conn.confirmTransaction(sig, "confirmed")
    await sleep(500)

    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()], vault.programId,
    )
    ;[registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.publicKey.toBuffer()], trana.programId,
    )
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], trana.programId,
    )
    treasuryPubkey = payer.publicKey

    // Init global fee config first — register_two_fa needs it
    try {
      await trana.methods
        .initConfig(new BN(REGISTER_FEE), new BN(RECOVERY_FEE), treasuryPubkey)
        .accounts({ config: configPda, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch { /* already initialized */ }

    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("test-cred"))
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([owner]).rpc()

    await vault.methods
      .initVault()
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // Fund vault: 5 × 0.9 SOL deposits (below 1 SOL threshold — no proof needed)
    for (let i = 0; i < 5; i++) {
      await vault.methods
        .deposit(new BN(0.9 * SOL))
        .accounts({
          vault:             vaultPda,
          owner:             owner.publicKey,
          systemProgram:     SystemProgram.programId,
          guardProgram:      trana.programId,
          tranaRegistry:     registryPda,
          tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([owner]).rpc()
    }
  })

  // ── Core withdraw helper ───────────────────────────────────────────────────
  //
  // accounts_hash field order mirrors the Withdraw struct definition:
  //   vault, owner, destination, guard_program, trana_registry,
  //   trana_instructions, system_program

  async function withdrawTx(opts: {
    amount:           number
    policy:           string
    privKey:          Uint8Array
    withProof:        boolean
    tamperedAmount?:  number
    useNonce?:        number
    delayAfterProofMs?: number
    overrideExpiry?:  number
    clusterInProof?:  string
    policyInProof?:   string
  }): Promise<string> {
    const { amount, policy, privKey, withProof } = opts
    const actualAmount = opts.tamperedAmount ?? amount
    const nonce        = opts.useNonce ?? registryNonce
    const expiry       = opts.overrideExpiry ?? Math.floor(Date.now() / 1000) + 300
    const dest         = Keypair.generate().publicKey

    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(),
      owner.publicKey.toBuffer(),
      dest.toBuffer(),
      trana.programId.toBuffer(),
      registryPda.toBuffer(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
      SystemProgram.programId.toBuffer(),
    ]))

    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))
    const paramsHash = sha256(amountBuf)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey, trana.programId, vault.programId,
      policy, WITHDRAW_DISC, accountsHash, paramsHash, nonce, expiry,
    )

    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, privKey)
    const pubKey = p256.getPublicKey(privKey, true)

    if (opts.delayAfterProofMs) await sleep(opts.delayAfterProofMs)

    const { blockhash } = await conn.getLatestBlockhash("confirmed")

    const clusterForProof = opts.clusterInProof ?? "localnet"
    const policyForProof  = opts.policyInProof  ?? policy

    const withdrawIx = await vault.methods
      .withdraw(new BN(actualAmount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        destination:       dest,
        guardProgram:      trana.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram:     SystemProgram.programId,
        tranaConfig:       configPda,
      })
      .instruction()

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    if (withProof) {
      tx.add(buildSecp256r1Ix(pubKey, sig, rawMsg))
      tx.add(buildRecordProofIx(trana.programId, 1, expiry, clusterForProof, policyForProof, authData, clientDataJSON))
    }
    tx.add(withdrawIx)
    return sendAndConfirmTransaction(conn, tx, [owner])
  }

  // ── R1 ─────────────────────────────────────────────────────────────────────
  it("R1: passkey registered in onchain PDA — owner, pubkey, nonce=0", async () => {
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.ok(reg.enabled,               "registry should be enabled")
    assert.equal(reg.nonce.toNumber(), 0, "initial nonce should be 0")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(p256PubKey), "pubkey mismatch")
  })

  // ── R2 ─────────────────────────────────────────────────────────────────────
  it("R2: withdraw with valid P-256 proof succeeds — nonce consumed", async () => {
    await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: true })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented")
  })

  // ── R3 ─────────────────────────────────────────────────────────────────────
  it("R3: replay with old nonce fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: true, useNonce: 0 })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R4 ─────────────────────────────────────────────────────────────────────
  it("R4: proof from unregistered P-256 key fails (WrongSigner)", async () => {
    const wrongKey = p256.utils.randomSecretKey()
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: wrongKey, withProof: true })
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") || (err as Error).message.includes("0x1773"),
        `Expected WrongSigner, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R5 ─────────────────────────────────────────────────────────────────────
  it("R5: tampered amount fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, tamperedAmount: 2 * SOL,
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R6 ─────────────────────────────────────────────────────────────────────
  it("R6: withdraw without secp256r1 proof fails (MissingProof)", async () => {
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: false })
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R7 ─────────────────────────────────────────────────────────────────────
  it("R7: simulate-first detects policy from logs and succeeds", async () => {
    const dest   = Keypair.generate().publicKey
    const amount = 1 * SOL

    const withdrawIx = await vault.methods
      .withdraw(new BN(amount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        destination:       dest,
        guardProgram:      trana.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram:     SystemProgram.programId,
        tranaConfig:       configPda,
      })
      .instruction()

    const { blockhash: probeBlockhash } = await conn.getLatestBlockhash("processed")
    const probeTx = new Transaction({ recentBlockhash: probeBlockhash, feePayer: owner.publicKey })
    probeTx.add(withdrawIx)

    const vtx = VersionedTransaction.deserialize(
      probeTx.serialize({ requireAllSignatures: false, verifySignatures: false })
    )
    const simResult = await conn.simulateTransaction(vtx, { replaceRecentBlockhash: true, sigVerify: false })
    const logs = simResult.value.logs ?? []

    assert.ok(logs.some(l => l.includes("TRANA_MISSING_PROOF")), "simulation should show TRANA_MISSING_PROOF")

    const detectedPolicy = parsePolicyFromLogs(logs)
    assert.ok(detectedPolicy, `should detect a policy from logs`)
    assert.ok(detectedPolicy!.startsWith("trana."), `expected trana. policy, got: ${detectedPolicy}`)

    const nonce  = registryNonce
    const expiry = Math.floor(Date.now() / 1000) + 300

    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(), owner.publicKey.toBuffer(), dest.toBuffer(),
      trana.programId.toBuffer(), registryPda.toBuffer(), SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
      SystemProgram.programId.toBuffer(),
    ]))
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))
    const paramsHash = sha256(amountBuf)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet", owner.publicKey, trana.programId, vault.programId,
      detectedPolicy!, WITHDRAW_DISC, accountsHash, paramsHash, nonce, expiry,
    )

    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, p256PrivKey)

    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(buildSecp256r1Ix(p256PubKey, sig, rawMsg))
    tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", detectedPolicy!, authData, clientDataJSON))
    tx.add(withdrawIx)

    await sendAndConfirmTransaction(conn, tx, [owner])
    registryNonce++

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R7")
  })

  // ── R8 ─────────────────────────────────────────────────────────────────────
  it("R8: 2 s simulated passkey delay — fresh blockhash, transaction succeeds", async () => {
    await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: true, delayAfterProofMs: 2_000 })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R8")
  })

  // ── R9 ─────────────────────────────────────────────────────────────────────
  it("R9: 5 s simulated passkey delay — fresh blockhash, transaction succeeds", async () => {
    await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: true, delayAfterProofMs: 5_000 })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R9")
  })

  // ── R10 ────────────────────────────────────────────────────────────────────
  it("R10: expired proof fails (ProofExpired)", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 10
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, overrideExpiry: pastExpiry,
      })
      assert.fail("Expected ProofExpired")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("ProofExpired") || (err as Error).message.includes("0x1771"),
        `Expected ProofExpired, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R11 ────────────────────────────────────────────────────────────────────
  it("R11: wrong cluster in record_proof fails (ClusterMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, clusterInProof: "wrongnet",
      })
      assert.fail("Expected ClusterMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("ClusterMismatch") || (err as Error).message.includes("0x177a"),
        `Expected ClusterMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R12 ────────────────────────────────────────────────────────────────────
  it("R12: wrong policy string in record_proof fails (PolicyMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, policyInProof: "trana.require",
      })
      assert.fail("Expected PolicyMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PolicyMismatch") || (err as Error).message.includes("0x1777"),
        `Expected PolicyMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R13 ────────────────────────────────────────────────────────────────────
  //
  // First-time registration (empty pubkey_bytes) → register_fee (0.005 SOL).

  it("R13: register_fee charged on first registration", async () => {
    const freshWallet = Keypair.generate()
    const airdrop = await conn.requestAirdrop(freshWallet.publicKey, 5 * SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    const [freshRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), freshWallet.publicKey.toBuffer()], trana.programId,
    )
    const treasuryBefore = await conn.getBalance(treasuryPubkey)

    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("fresh-cred"))
      .accounts({
        registry:      freshRegistry,
        owner:         freshWallet.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([freshWallet]).rpc()

    const treasuryAfter = await conn.getBalance(treasuryPubkey)
    assert.equal(
      treasuryAfter - treasuryBefore, REGISTER_FEE,
      `treasury should gain exactly ${REGISTER_FEE} lamports on first registration`,
    )
  })

  // ── R14 ────────────────────────────────────────────────────────────────────
  //
  // Re-registration (pubkey_bytes already set) → recovery_fee (0.01 SOL).

  it("R14: recovery_fee charged on re-registration", async () => {
    const newKey    = p256.utils.randomSecretKey()
    const newPubKey = p256.getPublicKey(newKey, true)
    const treasuryBefore = await conn.getBalance(treasuryPubkey)

    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(newPubKey), Buffer.from("recovery-cred"))
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([owner]).rpc()

    const treasuryAfter = await conn.getBalance(treasuryPubkey)
    assert.equal(
      treasuryAfter - treasuryBefore, RECOVERY_FEE,
      `treasury should gain exactly ${RECOVERY_FEE} lamports on re-registration`,
    )

    // Restore original key so subsequent tests still work
    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("test-cred"))
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([owner]).rpc()
  })

  // ── R15 ────────────────────────────────────────────────────────────────────
  it("R15: update_config by non-authority is rejected (Unauthorized)", async () => {
    const stranger = Keypair.generate()
    const airdrop = await conn.requestAirdrop(stranger.publicKey, SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    try {
      await trana.methods
        .updateConfig(new BN(99_000), new BN(199_000), stranger.publicKey)
        .accounts({ config: configPda, authority: stranger.publicKey })
        .signers([stranger]).rpc()
      assert.fail("Expected Unauthorized")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("Unauthorized") || (err as Error).message.includes("0x1778"),
        `Expected Unauthorized, got: ${(err as Error).message}`,
      )
    }
  })

  // ── Shared constant for tests using enforce as its own protected instruction ─

  const ENFORCE_DISC = sha256(Buffer.from("global:enforce")).slice(0, 8)

  async function enforceSelf(opts: {
    policyArg:    Record<string, unknown>
    policyString: string
    policyBytes:  Buffer
    withProof:    boolean
    privKey?:     Uint8Array
    useNonce?:    number
    overrideExpiry?: number
    remainingAccounts?: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
  }): Promise<string> {
    const { policyArg, policyString, policyBytes, withProof } = opts
    const nonce  = opts.useNonce ?? registryNonce
    const expiry = opts.overrideExpiry ?? Math.floor(Date.now() / 1000) + 300

    // enforce accounts: registry, owner, instructions
    const regularAccounts = [
      registryPda,
      owner.publicKey,
      SYSVAR_INSTRUCTIONS_PUBKEY,
    ]
    const remainingPubkeys = (opts.remainingAccounts ?? []).map(a => a.pubkey)
    const accountsHash = sha256(Buffer.concat(
      [...regularAccounts, ...remainingPubkeys].map(pk => pk.toBuffer()),
    ))

    const paramsHash = sha256(policyBytes)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonce, expiry,
    )

    const enforceBuilder = trana.methods
      .enforce(policyArg)
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })

    if (opts.remainingAccounts?.length) {
      enforceBuilder.remainingAccounts(opts.remainingAccounts)
    }

    const enforceIx = await enforceBuilder.instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })

    if (withProof) {
      const privKey = opts.privKey ?? p256PrivKey
      const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, privKey)
      const pubKey = p256.getPublicKey(privKey, true)
      tx.add(buildSecp256r1Ix(pubKey, sig, rawMsg))
      tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, authData, clientDataJSON))
    }

    tx.add(enforceIx)
    return sendAndConfirmTransaction(conn, tx, [owner])
  }

  // ── R22: Policy::NotBefore ─────────────────────────────────────────────────

  it("R22: Policy::NotBefore fires for far-future slot, no proof → MissingProof", async () => {
    const farFutureSlot = new BN("18446744073709551615")
    const enforceIx = await trana.methods
      .enforce({ notBefore: { slot: farFutureSlot } })
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(enforceIx)
    try {
      await sendAndConfirmTransaction(conn, tx, [owner])
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })

  it("R22b: Policy::NotBefore passes for slot 0 (already reached, no proof needed)", async () => {
    const enforceIx = await trana.methods
      .enforce({ notBefore: { slot: new BN(0) } })
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(enforceIx)
    await sendAndConfirmTransaction(conn, tx, [owner])
  })

  it("R22c: Policy::NotBefore fires for far-future slot, with proof → Success", async () => {
    const farFutureSlot = new BN("18446744073709551615")
    await enforceSelf({
      policyArg:    { notBefore: { slot: farFutureSlot } },
      policyString: "trana.not_before",
      policyBytes:  borshU64Policy(1, BigInt("18446744073709551615")),
      withProof:    true,
    })
    registryNonce++
  })

  // ── R23: Policy::NotAfter ──────────────────────────────────────────────────

  it("R23: Policy::NotAfter fires for slot 0 (already elapsed, no proof) → MissingProof", async () => {
    const enforceIx = await trana.methods
      .enforce({ notAfter: { slot: new BN(0) } })
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(enforceIx)
    try {
      await sendAndConfirmTransaction(conn, tx, [owner])
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })

  it("R23b: Policy::NotAfter passes for far-future slot (no proof needed)", async () => {
    const farFutureSlot = new BN("18446744073709551615")
    const enforceIx = await trana.methods
      .enforce({ notAfter: { slot: farFutureSlot } })
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(enforceIx)
    await sendAndConfirmTransaction(conn, tx, [owner])
  })

  it("R23c: Policy::NotAfter fires for slot 0 (already elapsed), with proof → Success", async () => {
    await enforceSelf({
      policyArg:    { notAfter: { slot: new BN(0) } },
      policyString: "trana.not_after",
      policyBytes:  borshU64Policy(2, BigInt(0)),
      withProof:    true,
    })
    registryNonce++
  })

  // ── R18: Limit policy below threshold ─────────────────────────────────────

  it("R18: Policy::Limit does not fire below threshold — no proof required", async () => {
    const depositAmount = 0.5 * SOL

    await vault.methods
      .deposit(new BN(depositAmount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        systemProgram:     SystemProgram.programId,
        guardProgram:      trana.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tranaConfig:       configPda,
      })
      .signers([owner]).rpc()

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce must not change when policy does not fire")
  })

  // ── R19: Re-registration preserves nonce ───────────────────────────────────

  it("R19: re-registration updates pubkey without resetting nonce", async () => {
    const newKey    = p256.utils.randomSecretKey()
    const newPubKey = p256.getPublicKey(newKey, true)
    const nonceBefore = registryNonce

    await trana.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(newPubKey),
        Buffer.from("new-cred-id"),
      )
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([owner]).rpc()

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), nonceBefore,        "nonce must survive re-registration")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(newPubKey), "pubkey should be updated")

    // Restore original key so subsequent tests still work
    await trana.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(p256PubKey),
        Buffer.from("test-cred"),
      )
      .accounts({
        registry:      registryPda,
        owner:         owner.publicKey,
        systemProgram: SystemProgram.programId,
        config:        configPda,
        treasury:      treasuryPubkey,
      })
      .signers([owner]).rpc()

    const regRestored = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(regRestored.nonce.toNumber(), nonceBefore, "nonce must survive second re-registration")
    assert.deepEqual(Buffer.from(regRestored.pubkeyBytes), Buffer.from(p256PubKey), "original key restored")
  })

  // ── R24: ComputeBudget prefix ──────────────────────────────────────────────
  //
  // tx layout: [ComputeBudget(0), secp256r1(1), record_proof(2), enforce(3)]
  //   enforce at N=3 → N-1=2 (record_proof ✓) → N-2=1 (secp256r1 ✓)

  it("R24: ComputeBudget prepended — secp256r1 still found at N-2", async () => {
    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])
    const nonce        = registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300

    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
    ]
    const accountsHash = sha256(Buffer.concat(accountsList.map(pk => pk.toBuffer())))
    const paramsHash   = sha256(policyBytes)
    const intentHash   = computeIntentHash(
      "trana:v1", "localnet", owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonce, expiry,
    )
    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, p256PrivKey)

    const enforceIx = await trana.methods.enforce(policyArg)
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    tx.add(buildSecp256r1Ix(p256PubKey, sig, rawMsg))
    tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, authData, clientDataJSON))
    tx.add(enforceIx)

    await sendAndConfirmTransaction(conn, tx, [owner])
    registryNonce++

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment after R24")
  })

  // ── R25: Two protected instructions in one tx ──────────────────────────────
  //
  // tx layout: [secp_A(0), proof_A(1), enforce_A(2), secp_B(3), proof_B(4), enforce_B(5)]

  it("R25: two protected instructions in one tx — each triplet succeeds independently (nonce +2)", async () => {
    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])
    const nonceA       = registryNonce
    const nonceB       = registryNonce + 1
    const expiry       = Math.floor(Date.now() / 1000) + 300

    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
    ]
    const accountsHash = sha256(Buffer.concat(accountsList.map(pk => pk.toBuffer())))
    const paramsHash   = sha256(policyBytes)

    const intentA = computeIntentHash(
      "trana:v1", "localnet", owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonceA, expiry,
    )
    const proofA = buildWebAuthnProof(intentA, p256PrivKey)

    const intentB = computeIntentHash(
      "trana:v1", "localnet", owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonceB, expiry,
    )
    const proofB = buildWebAuthnProof(intentB, p256PrivKey)

    const enforceIx = await trana.methods.enforce(policyArg)
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(buildSecp256r1Ix(p256PubKey, proofA.sig, proofA.rawMsg))
    tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, proofA.authData, proofA.clientDataJSON))
    tx.add(enforceIx)
    tx.add(buildSecp256r1Ix(p256PubKey, proofB.sig, proofB.rawMsg))
    tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, proofB.authData, proofB.clientDataJSON))
    tx.add(enforceIx)

    await sendAndConfirmTransaction(conn, tx, [owner])
    registryNonce += 2

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment by 2 after R25")
  })

  // ── R26: V0 transaction with address lookup table ──────────────────────────
  //
  // enforce only needs registry in the ALT now (owner is a signer, instructions
  // is a sysvar — neither benefits from ALT compression).

  it("R26: V0 transaction with address lookup table — ALT accounts resolve correctly in sysvar", async () => {
    const currentSlot = await conn.getSlot("finalized")
    const [createLutIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
      authority:   owner.publicKey,
      payer:       owner.publicKey,
      recentSlot:  currentSlot,
    })
    const extendLutIx = AddressLookupTableProgram.extendLookupTable({
      payer:       owner.publicKey,
      authority:   owner.publicKey,
      lookupTable: lutAddress,
      addresses:   [registryPda],
    })
    const { blockhash: setupBlockhash } = await conn.getLatestBlockhash("confirmed")
    const setupTx = new Transaction({ recentBlockhash: setupBlockhash, feePayer: owner.publicKey })
    setupTx.add(createLutIx, extendLutIx)
    await sendAndConfirmTransaction(conn, setupTx, [owner])

    await sleep(1500)

    const lutInfo = await conn.getAddressLookupTable(lutAddress)
    assert.ok(lutInfo.value, "lookup table must exist and be active")

    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])
    const nonce        = registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300

    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
    ]
    const accountsHash = sha256(Buffer.concat(accountsList.map(pk => pk.toBuffer())))
    const paramsHash   = sha256(policyBytes)
    const intentHash   = computeIntentHash(
      "trana:v1", "localnet", owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonce, expiry,
    )
    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, p256PrivKey)

    const enforceIx = await trana.methods.enforce(policyArg)
      .accounts({
        registry:     registryPda,
        owner:        owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
    const message = new TransactionMessage({
      payerKey:        owner.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        buildSecp256r1Ix(p256PubKey, sig, rawMsg),
        buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, authData, clientDataJSON),
        enforceIx,
      ],
    }).compileToV0Message([lutInfo.value!])

    const v0tx = new VersionedTransaction(message)
    v0tx.sign([owner])
    const txSig = await conn.sendTransaction(v0tx, { skipPreflight: false })
    await conn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed")

    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment after R26")
  })

})
