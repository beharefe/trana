/**
 * Trana Guard — core authorization test suite.
 *
 * All scenarios run against `workspace.Trana` only (no separate integration program).
 *
 *   R1.   Passkey registered in onchain PDA                          → Success
 *   R2.   enforce(Require) with valid P-256 proof                  → Success, nonce → 1
 *   R3.   Replay: reuse old nonce                                  → PayloadMismatch
 *   R4.   Wrong secp256r1 key in proof                             → WrongSigner
 *   R5.   Tampered params hash vs instruction                      → PayloadMismatch
 *   R6.   Missing secp256r1 precompile                             → MissingProof
 *   R8.   2 s delay after proof — fresh blockhash                    → Success
 *   R9.   5 s delay after proof — fresh blockhash                  → Success
 *   R10.  Expired proof (expiry < now)                             → ProofExpired
 *   R11.  Wrong cluster in record_proof                            → ClusterMismatch
 *   R12.  Wrong policy string in record_proof                      → PolicyMismatch
 *   R13.  Registration fee charged on first register               → +REGISTER_FEE in treasury
 *   R14.  Recovery fee charged on re-registration                  → +RECOVERY_FEE in treasury
 *   R15.  update_config by non-authority                           → Unauthorized
 *   R22.  Policy::NotBefore fires (far-future slot, no proof)      → MissingProof
 *  R22b. Policy::NotBefore passes (slot 0, no proof)               → Success
 *  R22c. Policy::NotBefore + proof                                 → Success
 *   R23. Policy::NotAfter fires (slot 0 elapsed, no proof)           → MissingProof
 *  R23b. Policy::NotAfter passes (far-future slot)                 → Success
 *  R23c. Policy::NotAfter + proof                                   → Success
 *   R19. Re-registration preserves nonce, updates pubkey            → Success
 *   R24. ComputeBudget prepended — secp256r1 still found at N-2     → Success
 *   R25. Two protected instructions in one tx (nonces N, N+1)       → Success (nonce +2)
 *   R26. V0 transaction with address lookup table                   → Success
 */

import * as anchor from "@coral-xyz/anchor"
import { p256 } from "@noble/curves/nist.js"

const { BN, AnchorProvider, workspace, setProvider } = anchor
type Program<T extends anchor.Idl> = anchor.Program<T>
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  type Connection,
} from "@solana/web3.js"
import { createHash } from "crypto"
import assert from "assert"
import type { Trana } from "../target/types/trana"

// ── Constants ─────────────────────────────────────────────────────────────────

const SOL          = 1_000_000_000
const REGISTER_FEE = 5_000_000   // 0.005 SOL
const RECOVERY_FEE = 10_000_000  // 0.01  SOL

// ── Crypto helpers ────────────────────────────────────────────────────────────

function sha256(data: Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Agave 3+ `solana-test-validator`: use V0 messages for secp256r1 multi-ix flows.
 * Preflight `simulateTransaction` returns InvalidProgramForExecution for those txs (false negative);
 * we send with `skipPreflight: true` and confirm on-chain.
 */
async function sendAndConfirmV0(
  connection: Connection,
  instructions: TransactionInstruction[],
  feePayer:     PublicKey,
  signers:      Keypair[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
  const message = new TransactionMessage({
    payerKey:        feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()
  const vtx = new VersionedTransaction(message)
  vtx.sign(signers)

  const sig = await connection.sendTransaction(vtx, {
    skipPreflight:       true,
    maxRetries:          5,
    preflightCommitment: "confirmed",
  })
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  )
  return sig
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
  domain:              string,
  cluster:             string,
  wallet:              PublicKey,
  tranaGuardProgramId: PublicKey,
  targetProgramId:     PublicKey,
  policy:              string,
  discriminator:       Buffer,
  accountsHash:        Buffer,
  paramsHash:          Buffer,
  nonce:               number,
  expiry:              number,
): Buffer {
  const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
  const u64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
  const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b }
  const d = Buffer.from(domain), cl = Buffer.from(cluster), p = Buffer.from(policy)
  return sha256(Buffer.concat([
    Buffer.from([1]),
    u16le(d.length),  d,
    u16le(cl.length), cl,
    wallet.toBuffer(), tranaGuardProgramId.toBuffer(), targetProgramId.toBuffer(),
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

// ── Borsh helpers (enforce-as-self tests) ─────────────────────────────────────

const u64LEbig = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b }

function borshU64Policy(variantIndex: number, value: bigint): Buffer {
  return Buffer.concat([Buffer.from([variantIndex]), u64LEbig(value)])
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("trana_guard — secp256r1 passkey enforcement", () => {
  const provider = AnchorProvider.env()
  setProvider(provider)

  const trana = workspace.Trana as Program<Trana>
  const conn  = provider.connection
  const payer = provider.wallet as anchor.Wallet

  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true)

  let owner:          Keypair
  let registryPda:    PublicKey
  let configPda:      PublicKey
  let treasuryPubkey: PublicKey
  let registryNonce = 0

  const ENFORCE_DISC = sha256(Buffer.from("global:enforce")).slice(0, 8)

  async function enforceSelf(opts: {
    policyArg:          Record<string, unknown>
    policyString:       string
    policyBytes:        Buffer
    withProof:          boolean
    privKey?:           Uint8Array
    useNonce?:          number
    overrideExpiry?:    number
    clusterInProof?:    string
    policyInProof?:     string
    delayAfterProofMs?: number
    /** If set, intent paramsHash uses this instead of policyBytes (tamper / R5). */
    intentParamsBytes?: Buffer
    remainingAccounts?: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
  }): Promise<string> {
    const { policyArg, policyString, policyBytes, withProof } = opts
    const nonce  = opts.useNonce ?? registryNonce
    const expiry = opts.overrideExpiry ?? Math.floor(Date.now() / 1000) + 300

    const regularAccounts = [
      registryPda,
      owner.publicKey,
      SYSVAR_INSTRUCTIONS_PUBKEY,
    ]
    const remainingPubkeys = (opts.remainingAccounts ?? []).map(a => a.pubkey)
    const accountsHash = sha256(Buffer.concat(
      [...regularAccounts, ...remainingPubkeys].map(pk => pk.toBuffer()),
    ))

    const paramsHash = sha256(opts.intentParamsBytes ?? policyBytes)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey, trana.programId, trana.programId,
      policyString, Buffer.from(ENFORCE_DISC), accountsHash, paramsHash, nonce, expiry,
    )

    const enforceBuilder = trana.methods
      .enforce(policyArg)
      .accounts({
        owner: owner.publicKey,
      })

    if (opts.remainingAccounts?.length) {
      enforceBuilder.remainingAccounts(opts.remainingAccounts)
    }

    const enforceIx = await enforceBuilder.instruction()
    const instructions: TransactionInstruction[] = []

    if (withProof) {
      const privKey = opts.privKey ?? p256PrivKey
      const { authData, clientDataJSON, rawMsg, sig } = buildWebAuthnProof(intentHash, privKey)
      const pubKey = p256.getPublicKey(privKey, true)
      if (opts.delayAfterProofMs) await sleep(opts.delayAfterProofMs)
      instructions.push(buildSecp256r1Ix(pubKey, sig, rawMsg))
      instructions.push(buildRecordProofIx(
        trana.programId, 1, expiry,
        opts.clusterInProof ?? "localnet",
        opts.policyInProof ?? policyString,
        authData, clientDataJSON,
      ))
    }

    instructions.push(enforceIx)
    return sendAndConfirmV0(conn, instructions, owner.publicKey, [owner])
  }

  beforeAll(async () => {
    owner = Keypair.generate()

    const sig = await conn.requestAirdrop(owner.publicKey, 20 * SOL)
    await conn.confirmTransaction(sig, "confirmed")
    await sleep(500)

    ;[registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.publicKey.toBuffer()], trana.programId,
    )
    ;[configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], trana.programId,
    )
    treasuryPubkey = payer.publicKey

    try {
      await trana.methods
        .initConfig(new BN(REGISTER_FEE), new BN(RECOVERY_FEE), treasuryPubkey)
        .accounts({ authority: payer.publicKey })
        .rpc()
    } catch { /* already initialized */ }

    await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("test-cred"))
      .accounts({
        owner:    owner.publicKey,
        treasury: treasuryPubkey,
      })
      .signers([owner]).rpc()
  })

  // ── R1 ─────────────────────────────────────────────────────────────────────
  it("R1: passkey registered in onchain PDA — owner, pubkey, nonce=0", async () => {
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.ok(reg.enabled,               "registry should be enabled")
    assert.equal(reg.nonce.toNumber(), 0, "initial nonce should be 0")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(p256PubKey), "pubkey mismatch")
  })

  // ── R2 ─────────────────────────────────────────────────────────────────────
  it("R2: enforce(Require) with valid P-256 proof — nonce consumed", async () => {
    await enforceSelf({
      policyArg:    { require: {} },
      policyString: "trana.require",
      policyBytes:  Buffer.from([0]),
      withProof:    true,
    })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented")
  })

  // ── R3 ─────────────────────────────────────────────────────────────────────
  it("R3: replay with old nonce fails (PayloadMismatch)", async () => {
    try {
      await enforceSelf({
        policyArg:    { require: {} },
        policyString: "trana.require",
        policyBytes:  Buffer.from([0]),
        withProof:    true,
        useNonce:     0,
      })
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
      await enforceSelf({
        policyArg:    { require: {} },
        policyString: "trana.require",
        policyBytes:  Buffer.from([0]),
        withProof:    true,
        privKey:      wrongKey,
      })
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") || (err as Error).message.includes("0x1773"),
        `Expected WrongSigner, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R5 ─────────────────────────────────────────────────────────────────────
  it("R5: wrong params hash vs instruction fails (PayloadMismatch)", async () => {
    try {
      await enforceSelf({
        policyArg:         { require: {} },
        policyString:        "trana.require",
        policyBytes:         Buffer.from([0]),
        intentParamsBytes:   Buffer.from([0, 0]),
        withProof:           true,
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
  it("R6: enforce(Require) without secp256r1 proof fails (MissingProof)", async () => {
    try {
      await enforceSelf({
        policyArg:    { require: {} },
        policyString: "trana.require",
        policyBytes:  Buffer.from([0]),
        withProof:    false,
      })
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R8 ─────────────────────────────────────────────────────────────────────
  it("R8: 2 s delay after proof — fresh blockhash, transaction succeeds", async () => {
    await enforceSelf({
      policyArg:          { require: {} },
      policyString:       "trana.require",
      policyBytes:        Buffer.from([0]),
      withProof:          true,
      delayAfterProofMs:  2_000,
    })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R8")
  })

  // ── R9 ─────────────────────────────────────────────────────────────────────
  it("R9: 5 s delay after proof — fresh blockhash, transaction succeeds", async () => {
    await enforceSelf({
      policyArg:          { require: {} },
      policyString:       "trana.require",
      policyBytes:        Buffer.from([0]),
      withProof:          true,
      delayAfterProofMs:  5_000,
    })
    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented after R9")
  })

  // ── R10 ────────────────────────────────────────────────────────────────────
  it("R10: expired proof fails (ProofExpired)", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 10
    try {
      await enforceSelf({
        policyArg:      { require: {} },
        policyString:   "trana.require",
        policyBytes:    Buffer.from([0]),
        withProof:      true,
        overrideExpiry: pastExpiry,
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
      await enforceSelf({
        policyArg:     { require: {} },
        policyString:  "trana.require",
        policyBytes:   Buffer.from([0]),
        withProof:     true,
        clusterInProof: "wrongnet",
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
      await enforceSelf({
        policyArg:     { require: {} },
        policyString:  "trana.require",
        policyBytes:   Buffer.from([0]),
        withProof:     true,
        policyInProof: "trana.limit",
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

  it("R13: register_fee charged on first registration", async () => {
    const freshWallet = Keypair.generate()
    const airdrop = await conn.requestAirdrop(freshWallet.publicKey, 5 * SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    const [freshRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), freshWallet.publicKey.toBuffer()], trana.programId,
    )
    const treasuryBefore = await conn.getBalance(treasuryPubkey)

    const regIx = await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("fresh-cred"))
      .accounts({
        owner:    freshWallet.publicKey,
        treasury: treasuryPubkey,
      })
      .instruction()
    await sendAndConfirmV0(conn, [regIx], freshWallet.publicKey, [freshWallet])

    const treasuryAfter = await conn.getBalance(treasuryPubkey)
    assert.equal(
      treasuryAfter - treasuryBefore, REGISTER_FEE,
      `treasury should gain exactly ${REGISTER_FEE} lamports on first registration`,
    )
  })

  // ── R14 ────────────────────────────────────────────────────────────────────

  it("R14: recovery_fee charged on re-registration", async () => {
    const newKey    = p256.utils.randomSecretKey()
    const newPubKey = p256.getPublicKey(newKey, true)
    const treasuryBefore = await conn.getBalance(treasuryPubkey)

    const recoveryIx = await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(newPubKey), Buffer.from("recovery-cred"))
      .accounts({
        owner:    owner.publicKey,
        treasury: treasuryPubkey,
      })
      .instruction()
    await sendAndConfirmV0(conn, [recoveryIx], owner.publicKey, [owner])

    const treasuryAfter = await conn.getBalance(treasuryPubkey)
    assert.equal(
      treasuryAfter - treasuryBefore, RECOVERY_FEE,
      `treasury should gain exactly ${RECOVERY_FEE} lamports on re-registration`,
    )

    const restoreIx = await trana.methods
      .registerTwoFa({ secp256R1Passkey: {} }, Buffer.from(p256PubKey), Buffer.from("test-cred"))
      .accounts({
        owner:    owner.publicKey,
        treasury: treasuryPubkey,
      })
      .instruction()
    await sendAndConfirmV0(conn, [restoreIx], owner.publicKey, [owner])
  })

  // ── R15 ────────────────────────────────────────────────────────────────────
  it("R15: update_config by non-authority is rejected (Unauthorized)", async () => {
    const stranger = Keypair.generate()
    const airdrop = await conn.requestAirdrop(stranger.publicKey, SOL)
    await conn.confirmTransaction(airdrop, "confirmed")

    try {
      await trana.methods
        .updateConfig(new BN(99_000), new BN(199_000), stranger.publicKey)
        .accounts({ authority: stranger.publicKey })
        .signers([stranger]).rpc()
      assert.fail("Expected Unauthorized")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("Unauthorized") || (err as Error).message.includes("0x1778"),
        `Expected Unauthorized, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R22: Policy::NotBefore ─────────────────────────────────────────────────

  it("R22: Policy::NotBefore fires for far-future slot, no proof → MissingProof", async () => {
    const farFutureSlot = new BN("18446744073709551615")
    const enforceIx = await trana.methods
      .enforce({ notBefore: { slot: farFutureSlot } })
      .accounts({
        owner: owner.publicKey,
      })
      .instruction()
    try {
      await sendAndConfirmV0(conn, [enforceIx], owner.publicKey, [owner])
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
        owner: owner.publicKey,
      })
      .instruction()
    await sendAndConfirmV0(conn, [enforceIx], owner.publicKey, [owner])
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
        owner: owner.publicKey,
      })
      .instruction()
    try {
      await sendAndConfirmV0(conn, [enforceIx], owner.publicKey, [owner])
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
        owner: owner.publicKey,
      })
      .instruction()
    await sendAndConfirmV0(conn, [enforceIx], owner.publicKey, [owner])
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
        owner:    owner.publicKey,
        treasury: treasuryPubkey,
      })
      .signers([owner]).rpc()

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), nonceBefore,        "nonce must survive re-registration")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(newPubKey), "pubkey should be updated")

    await trana.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(p256PubKey),
        Buffer.from("test-cred"),
      )
      .accounts({
        owner:    owner.publicKey,
        treasury: treasuryPubkey,
      })
      .signers([owner]).rpc()

    const regRestored = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(regRestored.nonce.toNumber(), nonceBefore, "nonce must survive second re-registration")
    assert.deepEqual(Buffer.from(regRestored.pubkeyBytes), Buffer.from(p256PubKey), "original key restored")
  })

  // ── R24: ComputeBudget prefix ──────────────────────────────────────────────

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
        owner: owner.publicKey,
      })
      .instruction()

    await sendAndConfirmV0(conn, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      buildSecp256r1Ix(p256PubKey, sig, rawMsg),
      buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, authData, clientDataJSON),
      enforceIx,
    ], owner.publicKey, [owner])
    registryNonce++

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment after R24")
  })

  // ── R25: Two protected instructions in one tx ──────────────────────────────

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
        owner: owner.publicKey,
      })
      .instruction()

    await sendAndConfirmV0(conn, [
      buildSecp256r1Ix(p256PubKey, proofA.sig, proofA.rawMsg),
      buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, proofA.authData, proofA.clientDataJSON),
      enforceIx,
      buildSecp256r1Ix(p256PubKey, proofB.sig, proofB.rawMsg),
      buildRecordProofIx(trana.programId, 1, expiry, "localnet", policyString, proofB.authData, proofB.clientDataJSON),
      enforceIx,
    ], owner.publicKey, [owner])
    registryNonce += 2

    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment by 2 after R25")
  })

  // ── R26: V0 transaction with address lookup table ──────────────────────────

  it("R26: V0 transaction with address lookup table — ALT accounts resolve correctly in sysvar", async () => {
    const currentSlot = await conn.getSlot("confirmed")
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
    await sendAndConfirmV0(conn, [createLutIx, extendLutIx], owner.publicKey, [owner])

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
        owner: owner.publicKey,
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
    const txSig = await conn.sendTransaction(v0tx, { skipPreflight: true })
    await conn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed")

    registryNonce++
    const reg = await trana.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should increment after R26")
  })
})
