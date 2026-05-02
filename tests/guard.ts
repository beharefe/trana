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
 *   R11. Wrong cluster in record_proof                           → PayloadMismatch
 *   R12. Wrong policy string in record_proof                     → PolicyMismatch
 *   R13. Fee deducted from owner and reaches treasury            → +20k in treasury
 *   R14. update_config by non-authority                          → Unauthorized
 *   R15. withdraw_fees by authority                              → Success
 *   R16. withdraw_fees by non-authority                          → Unauthorized
 *   R17. Wrong treasury pubkey in Enforce accounts               → constraint error
 *   R22. Policy::NotBefore fires (far-future slot, no proof)     → MissingProof
 *  R22b. Policy::NotBefore passes (slot 0 already reached)       → Success (no proof)
 *  R22c. Policy::NotBefore fires (far-future slot, with proof)   → Success
 *   R23. Policy::NotAfter fires (slot 0 already elapsed, no proof) → MissingProof
 *  R23b. Policy::NotAfter passes (far-future slot)               → Success (no proof)
 *  R23c. Policy::NotAfter fires (slot 0 already elapsed, with proof) → Success
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
const FEE_LAMPORTS = 20_000

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

const u32LE = (n: number)   => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
const u64LEbig = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b }

// Borsh-encode a single-u64 Policy variant by index.
// Used to compute paramsHash when enforce is its own protected instruction.
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
  let treasuryPubkey: PublicKey   // payer.publicKey — receives enforcement fees
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
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], trana.programId,
    )
    treasuryPubkey = payer.publicKey

    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("test-cred"))
      .accounts({ registry: registryPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    await vault.methods
      .initVault()
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // Init global fee config — idempotent across test runs
    try {
      await trana.methods
        .initConfig(new BN(FEE_LAMPORTS), treasuryPubkey)
        .accounts({ config: configPda, authority: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc()
    } catch { /* already initialized */ }

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
          tranaConfig:       configPda,
          tranaTreasury:     treasuryPubkey,
        })
        .signers([owner]).rpc()
    }
  })

  // ── Core withdraw helper ───────────────────────────────────────────────────
  //
  // accounts_hash field order mirrors the Withdraw struct definition:
  //   vault, owner, destination, guard_program, trana_registry,
  //   trana_instructions, trana_config, trana_treasury, system_program

  async function withdrawTx(opts: {
    amount:           number
    policy:           string
    privKey:          Uint8Array
    withProof:        boolean
    tamperedAmount?:  number
    useNonce?:        number
    delayAfterProofMs?: number
    overrideExpiry?:  number      // for R10: sign with a past expiry
    clusterInProof?:  string      // for R11: cluster written to record_proof (signing uses "localnet")
    policyInProof?:   string      // for R12: policy written to record_proof (signing uses `policy`)
    overrideTreasury?: PublicKey  // for R17: wrong treasury in accounts
  }): Promise<string> {
    const { amount, policy, privKey, withProof } = opts
    const actualAmount = opts.tamperedAmount ?? amount
    const nonce        = opts.useNonce ?? registryNonce
    const expiry       = opts.overrideExpiry ?? Math.floor(Date.now() / 1000) + 300
    const dest         = Keypair.generate().publicKey
    const treasury     = opts.overrideTreasury ?? treasuryPubkey

    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(),
      owner.publicKey.toBuffer(),
      dest.toBuffer(),
      trana.programId.toBuffer(),
      registryPda.toBuffer(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
      configPda.toBuffer(),
      treasury.toBuffer(),
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
        tranaConfig:       configPda,
        tranaTreasury:     treasury,
        systemProgram:     SystemProgram.programId,
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
        tranaConfig:       configPda,
        tranaTreasury:     treasuryPubkey,
        systemProgram:     SystemProgram.programId,
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
      configPda.toBuffer(), treasuryPubkey.toBuffer(), SystemProgram.programId.toBuffer(),
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
  //
  // Sign intent hash with "localnet" (correct), but put "wrongnet" in record_proof.
  // Guard computes intent using proof.cluster="wrongnet" → different hash → challenge mismatch.

  it("R11: wrong cluster in record_proof fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, clusterInProof: "wrongnet",
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R12 ────────────────────────────────────────────────────────────────────
  //
  // proof.policy = "trana.require" but withdraw enforces "trana.limit".
  // verify_with_policy checks proof.policy == expected → PolicyMismatch before challenge verify.

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
  // Treasury = payer.publicKey. owner (fresh Keypair) pays the fee.
  // After enforcement: treasury balance increases by exactly FEE_LAMPORTS.

  it("R13: 20k lamport fee is deducted from owner and reaches treasury", async () => {
    const before = await conn.getBalance(treasuryPubkey)
    await withdrawTx({ amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey, withProof: true })
    registryNonce++
    const after = await conn.getBalance(treasuryPubkey)
    assert.equal(after - before, FEE_LAMPORTS, `treasury should gain exactly ${FEE_LAMPORTS} lamports`)
  })

  // ── R14 ────────────────────────────────────────────────────────────────────
  it("R14: update_config by non-authority is rejected (Unauthorized)", async () => {
    const stranger = Keypair.generate()
    const airdrop = await conn.requestAirdrop(stranger.publicKey, SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    try {
      await trana.methods
        .updateConfig(new BN(99_000), stranger.publicKey)
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

  // ── R15 ────────────────────────────────────────────────────────────────────
  it("R15: authority can withdraw accumulated fees from treasury", async () => {
    const treasuryBalance = await conn.getBalance(treasuryPubkey)
    if (treasuryBalance < FEE_LAMPORTS) {
      console.log("    → skipping R15: treasury has no accumulated fees")
      return
    }
    const dest       = Keypair.generate().publicKey
    const destBefore = await conn.getBalance(dest)
    const withdrawAmt = FEE_LAMPORTS  // withdraw just one fee's worth

    await trana.methods
      .withdrawFees(new BN(withdrawAmt))
      .accounts({
        config:      configPda,
        authority:   payer.publicKey,
        treasury:    treasuryPubkey,
        destination: dest,
      })
      .rpc()

    const destAfter = await conn.getBalance(dest)
    assert.equal(destAfter - destBefore, withdrawAmt, "destination should receive exact withdrawal amount")
  })

  // ── R16 ────────────────────────────────────────────────────────────────────
  it("R16: withdraw_fees by non-authority is rejected (Unauthorized)", async () => {
    const stranger = Keypair.generate()
    const airdrop = await conn.requestAirdrop(stranger.publicKey, SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    try {
      await trana.methods
        .withdrawFees(new BN(FEE_LAMPORTS))
        .accounts({
          config:      configPda,
          authority:   stranger.publicKey,
          treasury:    treasuryPubkey,
          destination: stranger.publicKey,
        })
        .signers([stranger]).rpc()
      assert.fail("Expected Unauthorized")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("Unauthorized") || (err as Error).message.includes("0x1778"),
        `Expected Unauthorized, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R17 ────────────────────────────────────────────────────────────────────
  //
  // Pass a treasury pubkey that doesn't match config.treasury.
  // demo_vault's Withdraw constraint rejects it before the CPI.

  it("R17: wrong treasury in Enforce accounts is rejected", async () => {
    const fakeTreasury = Keypair.generate().publicKey
    try {
      await withdrawTx({
        amount: 1 * SOL, policy: "trana.limit", privKey: p256PrivKey,
        withProof: true, overrideTreasury: fakeTreasury,
      })
      assert.fail("Expected constraint error for wrong treasury")
    } catch (err: unknown) {
      assert.ok(err instanceof Error, "should fail with an error")
      assert.ok((err as Error).message.length > 0, "error should have a message")
    }
  })

  // ── Shared constant for tests using enforce as its own protected instruction ─

  // enforce discriminator — used to compute paramsHash when enforce is its own protected instruction
  const ENFORCE_DISC = sha256(Buffer.from("global:enforce")).slice(0, 8)

  // Build and send an `enforce(policy)` transaction where enforce is its own
  // protected instruction. Optionally includes secp256r1 + record_proof.
  async function enforceSelf(opts: {
    policyArg:    Record<string, unknown>
    policyString: string
    policyBytes:  Buffer   // Borsh(policy variant) — used to compute paramsHash
    withProof:    boolean
    privKey?:     Uint8Array
    useNonce?:    number
    overrideExpiry?: number
    remainingAccounts?: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
  }): Promise<string> {
    const { policyArg, policyString, policyBytes, withProof } = opts
    const nonce  = opts.useNonce ?? registryNonce
    const expiry = opts.overrideExpiry ?? Math.floor(Date.now() / 1000) + 300

    const regularAccounts = [
      registryPda,
      owner.publicKey,
      SYSVAR_INSTRUCTIONS_PUBKEY,
      configPda,
      treasuryPubkey,
      SystemProgram.programId,
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
        registry:      registryPda,
        owner:         owner.publicKey,
        instructions:  SYSVAR_INSTRUCTIONS_PUBKEY,
        config:        configPda,
        treasury:      treasuryPubkey,
        systemProgram: SystemProgram.programId,
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
  //
  // Passkey required UNTIL slot is reached. While current_slot < slot, every call
  // needs explicit approval. Once the slot passes, the guard lets calls through freely.
  // Use case: new feature requiring manual sign-off during its rollout window.

  it("R22: Policy::NotBefore fires for far-future slot, no proof → MissingProof", async () => {
    const farFutureSlot = new BN("18446744073709551615") // u64::MAX — condition always fires
    const enforceIx = await trana.methods
      .enforce({ notBefore: { slot: farFutureSlot } })
      .accounts({
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
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
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
      })
      .instruction()
    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    tx.add(enforceIx)
    // Slot 0 already reached → condition does NOT fire → no proof needed
    await sendAndConfirmTransaction(conn, tx, [owner])
  })

  it("R22c: Policy::NotBefore fires for far-future slot, with proof → Success", async () => {
    const farFutureSlot = new BN("18446744073709551615") // u64::MAX
    await enforceSelf({
      policyArg:    { notBefore: { slot: farFutureSlot } },
      policyString: "trana.not_before",
      policyBytes:  borshU64Policy(1, BigInt("18446744073709551615")),
      withProof:    true,
    })
    registryNonce++
  })

  // ── R23: Policy::NotAfter ──────────────────────────────────────────────────
  //
  // Passkey required AFTER slot passes. Before the slot, calls are free.
  // Once current_slot > slot, every call needs explicit approval.
  // Use case: emergency freeze that auto-activates at a specific slot without
  // anyone needing to call a pause function.

  it("R23: Policy::NotAfter fires for slot 0 (already elapsed, no proof) → MissingProof", async () => {
    const enforceIx = await trana.methods
      .enforce({ notAfter: { slot: new BN(0) } })
      .accounts({
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
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
    const farFutureSlot = new BN("18446744073709551615") // u64::MAX — condition never fires
    const enforceIx = await trana.methods
      .enforce({ notAfter: { slot: farFutureSlot } })
      .accounts({
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
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

  // ── R24: ComputeBudget prefix ──────────────────────────────────────────────
  //
  // Real-world txs commonly prepend ComputeBudget instructions.
  // Guard uses load_current_index_checked → N is relative, so secp256r1 at N-2
  // and record_proof at N-1 are still correct regardless of how many instructions
  // precede the triplet.
  //
  // tx layout: [ComputeBudget(0), secp256r1(1), record_proof(2), enforce(3)]
  //   enforce is at N=3 → N-1=2 (record_proof ✓) → N-2=1 (secp256r1 ✓)

  it("R24: ComputeBudget prepended — secp256r1 still found at N-2", async () => {
    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])   // Borsh: Require variant = 0, no fields
    const nonce        = registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300

    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
      configPda, treasuryPubkey, SystemProgram.programId,
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
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
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
  // Each protected instruction needs its own secp256r1 + record_proof pair.
  // The N-2 rule handles this correctly because N is relative for each instruction.
  //
  // tx layout: [secp_A(0), proof_A(1), enforce_A(2), secp_B(3), proof_B(4), enforce_B(5)]
  //   enforce_A at N=2 → N-1=1 (proof_A ✓) → N-2=0 (secp_A ✓)
  //   enforce_B at N=5 → N-1=4 (proof_B ✓) → N-2=3 (secp_B ✓)
  //
  // Proof B must be signed with nonce+1 — A consumes nonce N on-chain before B runs.
  // Both proofs are signed client-side before the tx is submitted.

  it("R25: two protected instructions in one tx — each triplet succeeds independently (nonce +2)", async () => {
    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])
    const nonceA       = registryNonce
    const nonceB       = registryNonce + 1
    const expiry       = Math.floor(Date.now() / 1000) + 300

    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
      configPda, treasuryPubkey, SystemProgram.programId,
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
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
      })
      .instruction()

    const { blockhash } = await conn.getLatestBlockhash("confirmed")
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    // Triplet A — indices 0, 1, 2
    tx.add(buildSecp256r1Ix(p256PubKey, proofA.sig, proofA.rawMsg))
    tx.add(buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, proofA.authData, proofA.clientDataJSON))
    tx.add(enforceIx)
    // Triplet B — indices 3, 4, 5
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
  // Solana's instructions sysvar resolves ALT accounts to their full pubkeys
  // before exposing them to programs. So accounts_hash computed on-chain (from
  // sysvar) must equal accounts_hash computed client-side (from resolved pubkeys).
  //
  // This test puts three enforce accounts into an ALT and verifies the intent
  // hash still matches after ALT resolution — confirming V0 txs are supported.

  it("R26: V0 transaction with address lookup table — ALT accounts resolve correctly in sysvar", async () => {
    // Create and populate the ALT
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
      addresses:   [registryPda, configPda, treasuryPubkey],
    })
    const { blockhash: setupBlockhash } = await conn.getLatestBlockhash("confirmed")
    const setupTx = new Transaction({ recentBlockhash: setupBlockhash, feePayer: owner.publicKey })
    setupTx.add(createLutIx, extendLutIx)
    await sendAndConfirmTransaction(conn, setupTx, [owner])

    // ALTs need a slot to warm up before use
    await sleep(1500)

    const lutInfo = await conn.getAddressLookupTable(lutAddress)
    assert.ok(lutInfo.value, "lookup table must exist and be active")

    const policyArg    = { require: {} }
    const policyString = "trana.require"
    const policyBytes  = Buffer.from([0])
    const nonce        = registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300

    // accountsHash uses fully-resolved pubkeys — same as what the sysvar will expose
    const accountsList = [
      registryPda, owner.publicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
      configPda, treasuryPubkey, SystemProgram.programId,
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
        registry: registryPda, owner: owner.publicKey,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        config: configPda, treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
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
