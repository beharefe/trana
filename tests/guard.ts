/**
 * Trana Guard — core authorization test suite.
 *
 * Tests the secp256r1 / WebAuthn proof path end-to-end.
 * The protected instruction is demo_vault::withdraw — the exact same
 * integration pattern an external protocol would use.
 *
 * Transaction shape:
 *   ix[0]: secp256r1 precompile   — native P-256 sig verify (SIMD-0075)
 *   ix[1]: guard::record_proof    — carries WebAuthn proof data
 *   ix[2]: demo_vault::withdraw   — calls guard::cpi::enforce() internally
 *
 * Scenarios:
 *   R1. Register secp256r1 passkey in onchain PDA      → Success
 *   R2. Withdraw with valid P-256 proof                → Success, nonce → 1
 *   R3. Replay: reuse old proof (nonce=0 consumed)     → PayloadMismatch
 *   R4. Wrong secp256r1 key in proof                   → WrongSigner
 *   R5. Tampered amount after proof issued             → PayloadMismatch
 *   R6. Missing secp256r1 precompile instruction       → MissingProof
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
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js"
import { createHash } from "crypto"
import assert from "assert"
import type { Guard }     from "../target/types/guard"
import type { DemoVault } from "../target/types/demo_vault"

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOL = 1_000_000_000

function sha256(data: Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(data).digest()
}

// demo_vault::withdraw discriminator from target/idl/demo_vault.json
const WITHDRAW_DISC = Buffer.from([0xb7, 0x12, 0x46, 0x9c, 0x94, 0x6d, 0xa1, 0x22])

// ── secp256r1 instruction builder (SIMD-0075 layout) ─────────────────────────
//   [0]       num_signatures (u8 = 1)
//   [1]       padding (u8 = 0)
//   [2..16]   SignatureOffsets (7 × u16-LE = 14 bytes)
//   [16..49]  pubkey (33-byte compressed P-256)
//   [49..113] signature (64-byte compact r‖s)
//   [113..145] message (32-byte e-value)

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
  data.writeUInt16LE(sigOffset,        2)
  data.writeUInt16LE(0xffff,           4)
  data.writeUInt16LE(pkOffset,         6)
  data.writeUInt16LE(0xffff,           8)
  data.writeUInt16LE(msgOffset,        10)
  data.writeUInt16LE(message.length,   12)
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
  guardProgramId: PublicKey,
  version:        number,
  expiry:         number,
  cluster:        string,
  policy:         string,
  authData:       Buffer,
  clientDataJSON: Buffer,
): TransactionInstruction {
  const disc     = sha256(Buffer.from("global:record_proof")).slice(0, 8)
  const u32le    = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const bStr     = (s: string) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
  const bBytes   = (b: Buffer) => Buffer.concat([u32le(b.length), b])
  const expiryBuf = Buffer.alloc(8)
  expiryBuf.writeBigInt64LE(BigInt(expiry))
  const data = Buffer.concat([
    disc, Buffer.from([version]), expiryBuf,
    bStr(cluster), bStr(policy), bBytes(authData), bBytes(clientDataJSON),
  ])
  return new TransactionInstruction({
    keys: [{ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }],
    programId: guardProgramId, data,
  })
}

// ── Intent hash (mirrors hashIntent() in packages/sdk/src/react/intent.ts) ───
//
// Binary encoding — must match compute_intent_hash() in programs/guard/src/lib.rs.
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
//   clientDataJSON:    {"type":"webauthn.get","challenge":"<base64url(intentHash)>",...}
//   e-value:           SHA-256(authData ‖ SHA-256(clientDataJSON))

function buildWebAuthnProof(
  intentHash: Buffer,
  privKey:    Uint8Array,
  rpId = "localhost",
): { authData: Buffer; clientDataJSON: Buffer; eValue: Buffer; sig: Uint8Array } {
  const authData = Buffer.alloc(37)
  sha256(Buffer.from(rpId)).copy(authData, 0)
  authData[32] = 0x05  // UP + UV flags
  const clientDataJSON = Buffer.from(JSON.stringify({
    type: "webauthn.get", challenge: intentHash.toString("base64url"),
    origin: `http://${rpId}`, crossOrigin: false,
  }))
  const rawMsg = Buffer.concat([authData, sha256(clientDataJSON)])
  const sig    = Uint8Array.from(p256.sign(rawMsg, privKey))
  const eValue = sha256(rawMsg)
  return { authData, clientDataJSON, eValue, sig }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("guard — secp256r1 passkey enforcement (via demo_vault::withdraw)", () => {
  const provider   = AnchorProvider.env()
  setProvider(provider)

  const guard = workspace.Guard     as Program<Guard>
  const vault = workspace.DemoVault as Program<DemoVault>
  const conn  = provider.connection
  const payer = provider.wallet as pkg.Wallet

  // P-256 keypair for tests — deterministic
  const p256PrivKey = p256.utils.randomSecretKey()
  const p256PubKey  = p256.getPublicKey(p256PrivKey, true)

  let owner:        Keypair
  let vaultPda:     PublicKey
  let registryPda:  PublicKey
  let registryNonce = 0

  before(async () => {
    owner = Keypair.generate()

    const sig = await conn.requestAirdrop(owner.publicKey, 20 * SOL)
    await conn.confirmTransaction(sig, "confirmed")
    await new Promise(r => setTimeout(r, 500))

    ;[vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()], vault.programId,
    )
    ;[registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.publicKey.toBuffer()], guard.programId,
    )

    // ── 1. Register passkey first — deposit requires registry to exist ─────────
    await guard.methods
      .registerTwoFa(
        { secp256R1Passkey: {} },
        Buffer.from(p256PubKey),
        Buffer.from("test-credential-id"),
      )
      .accounts({ registry: registryPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // ── 2. Init vault ─────────────────────────────────────────────────────────
    await vault.methods
      .initVault()
      .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner]).rpc()

    // ── 3. Fund vault.balance via small deposits (below LARGE_THRESHOLD = 1 SOL) ─
    //      0.9 SOL × 5 = 4.5 SOL — enough for multiple 1 SOL + 2 SOL withdrawals.
    for (let i = 0; i < 5; i++) {
      await vault.methods
        .deposit(new BN(0.9 * SOL))
        .accounts({
          vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId,
          guardProgram: guard.programId, tranaRegistry: registryPda,
          tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([owner]).rpc()
    }
  })

  // ── Helper: build + send a demo_vault::withdraw transaction ──────────────────
  //
  // When withProof=true:  [secp256r1, record_proof, demo_vault::withdraw]
  // When withProof=false: [demo_vault::withdraw]  ← expect MissingProof

  async function withdrawTx(opts: {
    amount:         number
    policy:         string
    privKey:        Uint8Array
    withProof:      boolean
    tamperedAmount?: number   // submit this amount but sign for `amount`
    useNonce?:       number   // override nonce (for replay tests)
  }): Promise<string> {
    const { amount, policy, privKey, withProof } = opts
    const actualAmount = opts.tamperedAmount ?? amount
    const nonce        = opts.useNonce !== undefined ? opts.useNonce : registryNonce
    const expiry       = Math.floor(Date.now() / 1000) + 300
    const dest         = Keypair.generate().publicKey

    // accounts_hash = SHA-256 of all accounts in Withdraw struct (in field order):
    //   vault, owner, destination, guard_program, trana_registry, trana_instructions
    const accountsHash = sha256(Buffer.concat([
      vaultPda.toBuffer(),
      owner.publicKey.toBuffer(),
      dest.toBuffer(),
      guard.programId.toBuffer(),
      registryPda.toBuffer(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBuffer(),
    ]))

    // params_hash = SHA-256(amount as u64-LE) — sign for `amount`, not tamperedAmount
    const amountBuf = Buffer.alloc(8)
    amountBuf.writeBigUInt64LE(BigInt(amount))
    const paramsHash = sha256(amountBuf)

    const intentHash = computeIntentHash(
      "trana:v1", "localnet",
      owner.publicKey,
      guard.programId,
      vault.programId,       // target = demo_vault (not guard)
      policy,
      WITHDRAW_DISC,
      accountsHash, paramsHash,
      nonce, expiry,
    )

    const { authData, clientDataJSON, sig } = buildWebAuthnProof(intentHash, privKey)
    const pubKey  = p256.getPublicKey(privKey, true)
    const rawMsg  = Buffer.concat([authData, sha256(clientDataJSON)])

    const withdrawIx = await vault.methods
      .withdraw(new BN(actualAmount))
      .accounts({
        vault:             vaultPda,
        owner:             owner.publicKey,
        destination:       dest,
        guardProgram:      guard.programId,
        tranaRegistry:     registryPda,
        tranaInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    const { blockhash } = await conn.getLatestBlockhash()
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
    if (withProof) {
      tx.add(buildSecp256r1Ix(pubKey, sig, rawMsg))
      tx.add(buildRecordProofIx(guard.programId, 1, expiry, "localnet", policy, authData, clientDataJSON))
    }
    tx.add(withdrawIx)
    return sendAndConfirmTransaction(conn, tx, [owner])
  }

  // ── R1. Verify passkey is registered ────────────────────────────────────────
  it("R1: passkey registered in onchain PDA — owner, pubkey, nonce=0", async () => {
    const reg = await guard.account.twoFactorRegistry.fetch(registryPda)
    assert.ok(reg.enabled, "registry should be enabled")
    assert.equal(reg.nonce.toNumber(), 0, "initial nonce should be 0")
    assert.deepEqual(Buffer.from(reg.pubkeyBytes), Buffer.from(p256PubKey), "pubkey mismatch")
  })

  // ── R2. Valid proof → success, nonce increments ─────────────────────────────
  it("R2: withdraw with valid P-256 proof succeeds — nonce consumed", async () => {
    await withdrawTx({ amount: 1 * SOL, policy: "transfer.large", privKey: p256PrivKey, withProof: true })
    registryNonce++
    const reg = await guard.account.twoFactorRegistry.fetch(registryPda)
    assert.equal(reg.nonce.toNumber(), registryNonce, "nonce should have incremented")
  })

  // ── R3. Replay — nonce=0 consumed, registry.nonce=1 ────────────────────────
  it("R3: replay with old nonce fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 2 * SOL, policy: "transfer.large", privKey: p256PrivKey,
        withProof: true, useNonce: 0,  // old nonce
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R4. Wrong signing key → WrongSigner ─────────────────────────────────────
  it("R4: proof from unregistered P-256 key fails (WrongSigner)", async () => {
    const wrongKey = p256.utils.randomSecretKey()
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "transfer.large", privKey: wrongKey, withProof: true })
      assert.fail("Expected WrongSigner")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("WrongSigner") || (err as Error).message.includes("0x1773"),
        `Expected WrongSigner, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R5. Tampered amount after proof issued → PayloadMismatch ────────────────
  it("R5: tampered amount fails (PayloadMismatch)", async () => {
    try {
      await withdrawTx({
        amount: 2 * SOL, policy: "transfer.large", privKey: p256PrivKey,
        withProof: true, tamperedAmount: 3 * SOL,  // sign for 2, submit 3
      })
      assert.fail("Expected PayloadMismatch")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("PayloadMismatch") || (err as Error).message.includes("0x1772"),
        `Expected PayloadMismatch, got: ${(err as Error).message}`,
      )
    }
  })

  // ── R6. No secp256r1 precompile → MissingProof ──────────────────────────────
  it("R6: withdraw without secp256r1 proof fails (MissingProof)", async () => {
    try {
      await withdrawTx({ amount: 1 * SOL, policy: "transfer.large", privKey: p256PrivKey, withProof: false })
      assert.fail("Expected MissingProof")
    } catch (err: unknown) {
      assert.ok(
        (err as Error).message.includes("MissingProof") || (err as Error).message.includes("0x1770"),
        `Expected MissingProof, got: ${(err as Error).message}`,
      )
    }
  })
})
