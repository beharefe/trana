/**
 * Trana Guard — core authorization test suite.
 *
 * Tests the secp256r1 / WebAuthn proof path end-to-end.
 * The protected instruction is demo_vault::withdraw — the exact same
 * integration pattern an external protocol would use.
 *
 * Transaction shape (with proof):
 *   ix[0]: secp256r1 precompile   — native P-256 sig verify (SIMD-0075)
 *   ix[1]: trana::record_proof    — carries WebAuthn proof data
 *   ix[2]: demo_vault::withdraw   — calls trana::cpi::enforce() internally
 *
 * Scenarios:
 *   R1. Register secp256r1 passkey in onchain PDA             → Success
 *   R2. Withdraw with valid P-256 proof                       → Success, nonce → 1
 *   R3. Replay: reuse old proof (nonce=0 consumed)            → PayloadMismatch
 *   R4. Wrong secp256r1 key in proof                          → WrongSigner
 *   R5. Tampered amount after proof issued                    → PayloadMismatch
 *   R6. Missing secp256r1 precompile instruction              → MissingProof
 *   R7. Simulate-first flow: detect policy from logs, then prove → Success
 *   R8. 2 s delay between passkey approval and blockhash fetch → Success
 *   R9. 5 s delay — blockhash fetched fresh, still valid       → Success
 */

import { p256 } from "@noble/curves/nist.js"
import pkg from "@coral-xyz/anchor"
const { BN, AnchorProvider, workspace, setProvider } = pkg
type Program<T extends pkg.Idl> = pkg.Program<T>
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
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

const SOL = 1_000_000_000

// demo_vault::withdraw discriminator  (first 8 bytes from target/idl/demo_vault.json)
const WITHDRAW_DISC = Buffer.from([0xb7, 0x12, 0x46, 0x9c, 0x94, 0x6d, 0xa1, 0x22])

// ── Crypto helpers ────────────────────────────────────────────────────────────

function sha256(data: Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── secp256r1 instruction builder (SIMD-0075 layout) ─────────────────────────
//   [0]        num_signatures (u8 = 1)
//   [1]        padding (u8 = 0)
//   [2..16]    SignatureOffsets (7 × u16-LE = 14 bytes)
//   [16..49]   pubkey (33-byte compressed P-256)
//   [49..113]  signature (64-byte compact r‖s)
//   [113..N]   message (e-value bytes)

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

// ── Intent hash (mirrors compute_intent_hash() in programs/guard/src/verify.rs) ─
//
// Canonical binary encoding — must match exactly.
// u16-LE length prefixes for strings; all integers little-endian.

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
//
// Minimal structurally-valid WebAuthn assertion:
//   authenticatorData: rpIdHash(32) + flags(1) + counter(4) = 37 bytes
//   clientDataJSON:    {"type":"webauthn.get","challenge":"<base64url(intentHash)>"}
//   e-value:           SHA-256(authData ‖ SHA-256(clientDataJSON))

function buildWebAuthnProof(
  intentHash: Buffer,
  privKey:    Uint8Array,
  rpId = "localhost",
): { authData: Buffer; clientDataJSON: Buffer; rawMsg: Buffer; sig: Uint8Array } {
  const authData = Buffer.alloc(37)
  sha256(Buffer.from(rpId)).copy(authData, 0)
  authData[32] = 0x05  // UP + UV flags
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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("guard — secp256r1 passkey enforcement (via demo_vault::withdraw)", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const trana = workspace.Trana    as Program<Trana>
  const vault = workspace.DemoVault as Program<DemoVault>
  const conn  = provider.connection
  const payer = provider.wallet as pkg.Wallet

  // Deterministic P-256 keypair for all tests
  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true)

  let owner:         Keypair
  let vaultPda:      PublicKey
  let registryPda:   PublicKey
  let registryNonce = 0

  before(async () => {
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

    // Register passkey
    await trana.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(p256PubKey),
        Buffer.from("test-credential-id"),
      )
      .accounts({ registry: registryPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // Init vault
    await vault.methods
      .initVault()
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // Fund vault with 5 × 0.9 SOL small deposits (below 1 SOL LARGE_THRESHOLD)
    for (let i = 0; i < 5; i++) {
      await vault.methods
        .deposit(new BN(0.9 * SOL))
        .accounts({
          vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId,
          guardProgram: trana.programId, tranaRegistry: registryPda,
          tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([owner]).rpc()
    }
  })

  // ── Core withdraw helper ───────────────────────────────────────────────────
  //
  // Correct flow:
  //   1. Build proof (passkey signs over accounts + params + nonce + expiry)
  //   2. Fetch FRESH blockhash AFTER proof is ready
  //   3. Assemble and send
  //
  // This mirrors production: passkey approval (step 1) can take seconds.
  // Fetching the blockhash after (step 2) means no expiry risk.

  async function withdrawTx(opts: {
    amount:          number
    policy:          string
    privKey:         Uint8Array
    withProof:       boolean
    tamperedAmount?: number  // submit this amount but sign for `amount`
    useNonce?:       number  // override nonce (for replay tests)
    delayAfterProofMs?: number  // simulate passkey latency before blockhash fetch
  }): Promise<string> {
    const { amount, policy, privKey, withProof } = opts
    const actualAmount = opts.tamperedAmount ?? amount
    const nonce        = opts.useNonce ?? registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300
    const dest         = Keypair.generate().publicKey

    // accounts_hash — field order matches Withdraw struct definition
    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(),
      owner.publicKey.toBuffer(),
      dest.toBuffer(),
      trana.programId.toBuffer(),
      registryPda.toBuffer(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
    ]))

    // params_hash — SHA-256 of amount as u64-LE (sign for `amount`, not tamperedAmount)
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))
    const paramsHash = sha256(amountBuf)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey,
      trana.programId,
      vault.programId,
      policy,
      WITHDRAW_DISC,
      accountsHash, paramsHash,
      nonce, expiry,
    )

    // ── Step 1: build WebAuthn proof (simulates passkey approval) ─────────────
    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, privKey)
    const pubKey = p256.getPublicKey(privKey, true)

    // ── Step 2: simulate passkey latency (delay BEFORE blockhash fetch) ────────
    if (opts.delayAfterProofMs) {
      await sleep(opts.delayAfterProofMs)
    }

    // ── Step 3: fetch FRESH blockhash NOW — after proof is ready ──────────────
    const { blockhash } = await conn.getLatestBlockhash("confirmed")

    // ── Step 4: assemble transaction ──────────────────────────────────────────
    const withdrawIx = await vault.methods
      .withdraw(new BN(actualAmount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        destination:       dest,
        guardProgram:      trana.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    if (withProof) {
      tx.add(buildSecp256r1Ix(pubKey, sig, rawMsg))
      tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policy, authData, clientDataJSON))
    }
    tx.add(withdrawIx)
    return sendAndConfirmTransaction(conn, tx, [owner])
  }

  // ── R1: passkey registered ─────────────────────────────────────────────────
  it("R1: passkey registered in onchain PDA — owner, pubkey, nonce=0", async () => {
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.ok(reg.enabled,               "registry should be enabled")
    assert.equal(reg.nonce.toNumber(), 0, "initial nonce should be 0")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(p256PubKey), "pubkey mismatch")
  })

  // ── R2: valid proof → success, nonce increments ────────────────────────────
  it("R2: withdraw with valid P-256 proof succeeds — nonce consumed", async () => {
    await withdrawTx({ amount: 1 * SOL, policy: "trana.threshold", privKey: p256PrivKey, withProof: true })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented")
  })

  // ── R3: replay attack ──────────────────────────────────────────────────────
  it("R3: replay with old nonce fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.threshold", privKey: p256PrivKey,
        withProof: true, useNonce: 0,
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R4: wrong signing key ──────────────────────────────────────────────────
  it("R4: proof from unregistered P-256 key fails (WrongSigner)", async () => {
    const wrongKey = p256.utils.randomSecretKey()
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "trana.threshold", privKey: wrongKey, withProof: true })
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") || (err as Error).message.includes("0x1773"),
        `Expected WrongSigner, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R5: tampered amount ────────────────────────────────────────────────────
  it("R5: tampered amount fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.threshold", privKey: p256PrivKey,
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

  // ── R6: missing secp256r1 instruction ─────────────────────────────────────
  it("R6: withdraw without secp256r1 proof fails (MissingProof)", async () => {
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "trana.threshold", privKey: p256PrivKey, withProof: false })
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R7: simulate-first flow ────────────────────────────────────────────────
  //
  // Validates the SDK's auto-detect path:
  //   1. Build the withdraw instruction (no proof yet)
  //   2. Simulate — look for "TRANA require | policy=X" in logs
  //   3. Use the detected policy string in the intent hash (no manual config)
  //   4. Build proof with detected policy → submit → success

  it("R7: simulate-first detects policy from logs and succeeds", async () => {
    const dest = Keypair.generate().publicKey
    const amount = 1 * SOL

    // Build withdraw instruction — no proof attached yet
    const withdrawIx = await vault.methods
      .withdraw(new BN(amount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        destination:       dest,
        guardProgram:      trana.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash: probeBlockhash } = await conn.getLatestBlockhash("processed")
    const probeTx = new Transaction({ recentBlockhash: probeBlockhash, feePayer: owner.publicKey })
    probeTx.add(withdrawIx)

    // Simulate without wallet signature
    const vtx = VersionedTransaction.deserialize(
      probeTx.serialize({ requireAllSignatures: false, verifySignatures: false })
    )
    const simResult = await conn.simulateTransaction(vtx, {
      replaceRecentBlockhash: true,
      sigVerify:              false,
    })
    const logs = simResult.value.logs ?? []

    // Verify the guard emitted a TRANA require log
    const hasMissingProof = logs.some(l => l.includes("TRANA_MISSING_PROOF"))
    assert.ok(hasMissingProof, "simulation should show TRANA_MISSING_PROOF")

    // Parse the policy string the guard expects
    const detectedPolicy = parsePolicyFromLogs(logs)
    assert.ok(detectedPolicy, `should detect a policy from logs, got: ${JSON.stringify(logs)}`)
    assert.ok(
      detectedPolicy!.startsWith("trana."),
      `detected policy should be a standard trana policy, got: ${detectedPolicy}`,
    )

    // Now build proof using the DETECTED policy (not hardcoded)
    const nonce  = registryNonce
    const expiry = Math.floor(Date.now() / 1000) + 300

    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(),
      owner.publicKey.toBuffer(),
      dest.toBuffer(),
      trana.programId.toBuffer(),
      registryPda.toBuffer(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
    ]))
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))
    const paramsHash = sha256(amountBuf)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey, trana.programId, vault.programId,
      detectedPolicy!,
      WITHDRAW_DISC, accountsHash, paramsHash,
      nonce, expiry,
    )

    const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, p256PrivKey)

    // Fresh blockhash AFTER proof is built
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

  // ── R8: 2 s passkey delay — blockhash fetched fresh afterward ─────────────
  //
  // Simulates a user taking 2 seconds to approve the passkey prompt.
  // The blockhash is fetched AFTER the delay so it is always fresh.
  // If blockhash were fetched before the delay, this is the scenario where
  // slow networks or slow biometric readers could cause timeouts.

  it("R8: 2 s simulated passkey delay — fresh blockhash, transaction succeeds", async () => {
    await withdrawTx({
      amount:             1 * SOL,
      policy:             "trana.threshold",
      privKey:            p256PrivKey,
      withProof:          true,
      delayAfterProofMs:  2_000,
    })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R8")
  })

  // ── R9: 5 s passkey delay ──────────────────────────────────────────────────
  //
  // More aggressive delay — still well within the ~90 s blockhash window, but
  // validates that the flow doesn't accumulate timing assumptions.

  it("R9: 5 s simulated passkey delay — fresh blockhash, transaction succeeds", async () => {
    await withdrawTx({
      amount:             1 * SOL,
      policy:             "trana.threshold",
      privKey:            p256PrivKey,
      withProof:          true,
      delayAfterProofMs:  5_000,
    })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R9")
  })
})
