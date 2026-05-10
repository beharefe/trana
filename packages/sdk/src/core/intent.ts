// Copyright 2025 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * TranaIntent — the canonical, replay-proof description of an authorized action.
 *
 * Security model:
 *   - `nonce` is read from the on-chain registry and incremented after each approval
 *   - `expiryUnix` bounds the proof's validity window
 *   - Every field below is bound into the challenge (hashIntent); changing any field
 *     after the passkey signs will cause on-chain verification to fail
 *
 * Two-factor split:
 *   - Passkey signs hashIntent(intent) as the WebAuthn challenge (proves approval)
 *   - Wallet signs the Solana transaction (proves identity + pays fees)
 *   These are separate signings, both required.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js"
import { sha256Bytes } from "./sha256"

// ── IntentInput ───────────────────────────────────────────────────────────────

/**
 * Developer-supplied description of the action to authorize.
 * Derive this from the `TransactionInstruction` using `intentFromInstruction()`.
 */
export type IntentInput = {
  /** The program whose instruction is being guarded. */
  targetProgramId: PublicKey | string
  /**
   * 8-byte Anchor discriminator (first 8 bytes of instruction data).
   * Bind this to prevent approving a different instruction in the same program.
   */
  instructionDiscriminator?: Uint8Array | string
  /**
   * Account pubkeys involved in the guarded instruction.
   * Their pubkeys are hashed in — swapping accounts invalidates the proof.
   */
  accounts?: PublicKey[]
  /**
   * Raw instruction parameters (excluding the 8-byte discriminator).
   * A different amount/destination will produce a different hash.
   */
  params?: Uint8Array
  /** Policy identifier string — overrides the client default if provided. */
  policy?: string
}

// ── TranaIntent ───────────────────────────────────────────────────────────────

export type TranaIntent = {
  readonly version:                  1
  readonly domain:                   "trana:v1"
  readonly wallet:                   string   // base58 owner pubkey
  readonly tranaGuardProgramId:      string   // base58 trana_guard program ID
  readonly targetProgramId:          string   // base58 guarded instruction's program
  readonly policyId:                 string   // e.g. "trana.require"
  readonly instructionDiscriminator: string   // hex-encoded 8 bytes
  readonly accountsHash:             string   // hex SHA-256 of account pubkeys
  readonly paramsHash:               string   // hex SHA-256 of instruction params
  readonly nonce:                    string   // decimal u64 string from registry
  readonly expiryUnix:               number
  // Display-only — NOT included in hashIntent(), safe to show in UI
  readonly rawParamsHex:             string
  readonly accountsCount:            number
}

// ── Builder ───────────────────────────────────────────────────────────────────

const EMPTY_HASH = Buffer.from(sha256Bytes(new Uint8Array(0))).toString("hex")

/**
 * Build a frozen `TranaIntent` from developer input + runtime context.
 *
 * Call AFTER fetching the registry nonce and BEFORE the WebAuthn ceremony —
 * the challenge must be fully determined before `navigator.credentials.get()`.
 */
export function buildIntent(
  wallet:              PublicKey,
  tranaGuardProgramId: PublicKey,
  input:               IntentInput,
  nonce:               bigint,
  config:              { policy: string; expiryTtlSec?: number },
): TranaIntent {
  const targetProgramId = typeof input.targetProgramId === "string"
    ? input.targetProgramId
    : input.targetProgramId.toBase58()

  let discriminatorHex = "0000000000000000"
  if (input.instructionDiscriminator) {
    const d = input.instructionDiscriminator
    discriminatorHex = typeof d === "string"
      ? d.toLowerCase().padStart(16, "0")
      : Buffer.from(d.slice(0, 8)).toString("hex")
  }

  const accountsHash = input.accounts?.length
    ? Buffer.from(sha256Bytes(
        Buffer.concat(input.accounts.map(a => a.toBuffer()))
      )).toString("hex")
    : EMPTY_HASH

  const paramsHash = input.params?.length
    ? Buffer.from(sha256Bytes(input.params)).toString("hex")
    : EMPTY_HASH

  return Object.freeze({
    version:                  1 as const,
    domain:                   "trana:v1" as const,
    wallet:                   wallet.toBase58(),
    tranaGuardProgramId:      tranaGuardProgramId.toBase58(),
    targetProgramId,
    policyId:                 input.policy ?? config.policy,
    instructionDiscriminator: discriminatorHex,
    accountsHash,
    paramsHash,
    nonce:                    nonce.toString(10),
    expiryUnix:               Math.floor(Date.now() / 1000) + (config.expiryTtlSec ?? 120),
    rawParamsHex:             input.params?.length ? Buffer.from(input.params).toString("hex") : "",
    accountsCount:            input.accounts?.length ?? 0,
  })
}

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Compute the 32-byte canonical challenge for a `TranaIntent`.
 *
 * This becomes the `challenge` field in the WebAuthn ceremony — it
 * cryptographically binds the passkey signature to the exact authorized action.
 *
 * Canonical binary encoding (deterministic, reproducible on-chain):
 *   version                u8
 *   domain                 u16-LE length + UTF-8 bytes
 *   wallet                 32 bytes (base58-decoded)
 *   tranaGuardProgramId    32 bytes
 *   targetProgramId        32 bytes
 *   policyId               u16-LE length + UTF-8 bytes
 *   instructionDiscriminator 8 bytes (hex-decoded)
 *   accountsHash           32 bytes (hex-decoded)
 *   paramsHash             32 bytes (hex-decoded)
 *   nonce                  8 bytes u64 LE
 *   expiryUnix             8 bytes i64 LE
 */
export function hashIntent(intent: TranaIntent): Uint8Array {
  const enc    = new TextEncoder()
  const domain  = enc.encode(intent.domain)
  const policy  = enc.encode(intent.policyId)

  const walletBytes     = new PublicKey(intent.wallet).toBytes()
  const tranaGuardBytes = new PublicKey(intent.tranaGuardProgramId).toBytes()
  const targetBytes     = new PublicKey(intent.targetProgramId).toBytes()
  const discrimBytes    = Buffer.from(intent.instructionDiscriminator, "hex")
  const accountsBytes   = Buffer.from(intent.accountsHash, "hex")
  const paramsBytes     = Buffer.from(intent.paramsHash, "hex")

  const u16le = (n: number) => {
    const b = Buffer.allocUnsafe(2)
    new DataView(b.buffer, b.byteOffset, 2).setUint16(0, n, true)
    return b
  }
  const nonceBuf  = Buffer.allocUnsafe(8)
  const expiryBuf = Buffer.allocUnsafe(8)
  new DataView(nonceBuf.buffer,  nonceBuf.byteOffset,  8).setBigUint64(0, BigInt(intent.nonce),     true)
  new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64( 0, BigInt(intent.expiryUnix), true)

  const payload = Buffer.concat([
    Buffer.from([intent.version]),
    u16le(domain.length),  Buffer.from(domain),
    walletBytes,
    tranaGuardBytes,
    targetBytes,
    u16le(policy.length),  Buffer.from(policy),
    discrimBytes,
    accountsBytes,
    paramsBytes,
    nonceBuf,
    expiryBuf,
  ])

  return sha256Bytes(payload)
}

// ── intentFromInstruction ─────────────────────────────────────────────────────

/**
 * Derive `IntentInput` directly from a `TransactionInstruction`.
 *
 * Eliminates manual extraction of discriminator, accounts, and params —
 * all three are computed from the instruction object the caller already has.
 */
export function intentFromInstruction(
  ix:     TransactionInstruction,
  label?: string,
): IntentInput {
  void label  // label is display-only, not part of the returned IntentInput
  return {
    targetProgramId:          ix.programId,
    instructionDiscriminator: ix.data.length >= 8 ? Uint8Array.from(ix.data.slice(0, 8)) : undefined,
    accounts:                 ix.keys.map(k => k.pubkey),
    params:                   ix.data.length > 8  ? Uint8Array.from(ix.data.slice(8))    : undefined,
  }
}
