import { PublicKey } from "@solana/web3.js"
import { sha256Bytes } from "../utils"

// ── IntentInput ───────────────────────────────────────────────────────────────

/**
 * Developer-facing description of the action being authorized.
 * Passed to authorizeAndSend({ buildIntent: () => IntentInput }).
 *
 * Every field included here is bound into the proof — if any field changes
 * after approval the onchain verification fails.
 */
export type IntentInput = {
  /** The Anchor / Solana program whose instruction is being guarded */
  targetProgramId: PublicKey | string
  /**
   * 8-byte Anchor instruction discriminator (first 8 bytes of the instruction data).
   * Hex string or Uint8Array. Zeroed if absent — include it for tighter binding.
   */
  instructionDiscriminator?: Uint8Array | string
  /**
   * Accounts involved in the guarded instruction.
   * Their pubkeys are hashed into the proof — swapping accounts invalidates it.
   */
  accounts?: PublicKey[]
  /**
   * Raw instruction parameter bytes (excluding discriminator).
   * Hash is bound in the proof — changing amount/destination/etc. invalidates it.
   */
  params?: Uint8Array
  /** Override the policy from TranaConfig for this specific action */
  policy?: string
}

// ── TranaIntent ───────────────────────────────────────────────────────────────

/**
 * Frozen, fully-determined description of the action being authorized.
 *
 * Built before the WebAuthn ceremony so the challenge (= hashIntent(intent))
 * is fully determined before navigator.credentials.get() is called.
 *
 * Replay is prevented by:
 *   - nonce:      incremented by the onchain program on every successful approval
 *   - expiryUnix: proof is invalid after this Unix timestamp
 *   - exact field binding: every field below is included in the hash
 *
 * Passkey role: approves this intent (signs hashIntent(intent) as challenge)
 * Wallet role:  signs the final Solana transaction (not the intent)
 * These are separate and both are required.
 */
export type TranaIntent = {
  readonly version:                  1
  readonly domain:                   "trana:v1"
  readonly cluster:                  string            // "mainnet-beta" | "devnet" | "localnet"
  readonly wallet:                   string            // base58 — the authorizing wallet
  readonly guardProgramId:           string            // base58 — Trana guard program
  readonly targetProgramId:          string            // base58 — the guarded instruction's program
  readonly policyId:                 string            // e.g. "AdminAction" | "HighValueTransfer"
  readonly instructionDiscriminator: string            // hex-encoded 8 bytes
  readonly accountsHash:             string            // hex-encoded SHA-256 of account pubkeys
  readonly paramsHash:               string            // hex-encoded SHA-256 of instruction params
  readonly nonce:                    string            // decimal bigint string (u64 from registry)
  readonly expiryUnix:               number
}

// ── Builder ───────────────────────────────────────────────────────────────────

const EMPTY_HASH = Buffer.from(sha256Bytes(new Uint8Array(0))).toString("hex")

/**
 * Build a frozen TranaIntent from developer-provided IntentInput plus
 * runtime context (wallet, nonce from registry, config).
 *
 * Call this AFTER fetching the current registry nonce and BEFORE calling
 * navigator.credentials.get() — the challenge must be fully determined
 * before the WebAuthn ceremony begins.
 */
export function buildIntent(
  wallet:         PublicKey,
  guardProgramId: PublicKey,
  input:          IntentInput,
  nonce:          bigint,
  config:         { policy: string; cluster?: string; expiryTtlSec?: number }
): TranaIntent {
  const targetProgramId = typeof input.targetProgramId === "string"
    ? input.targetProgramId
    : input.targetProgramId.toBase58()

  // Instruction discriminator — default to 8 zero bytes
  let discriminatorHex = "0000000000000000"
  if (input.instructionDiscriminator) {
    const d = input.instructionDiscriminator
    discriminatorHex = typeof d === "string"
      ? d.toLowerCase().padStart(16, "0")
      : Buffer.from(d.slice(0, 8)).toString("hex")
  }

  // accountsHash = SHA-256(concat of 32-byte account pubkeys)
  const accountsHash = input.accounts?.length
    ? Buffer.from(sha256Bytes(
        Buffer.concat(input.accounts.map(a => a.toBuffer()))
      )).toString("hex")
    : EMPTY_HASH

  // paramsHash = SHA-256(raw params)
  const paramsHash = input.params?.length
    ? Buffer.from(sha256Bytes(input.params)).toString("hex")
    : EMPTY_HASH

  return Object.freeze({
    version:                  1 as const,
    domain:                   "trana:v1" as const,
    cluster:                  config.cluster ?? "mainnet-beta",
    wallet:                   wallet.toBase58(),
    guardProgramId:           guardProgramId.toBase58(),
    targetProgramId,
    policyId:                 input.policy ?? config.policy,
    instructionDiscriminator: discriminatorHex,
    accountsHash,
    paramsHash,
    nonce:                    nonce.toString(10),
    expiryUnix:               Math.floor(Date.now() / 1000) + (config.expiryTtlSec ?? 120),
  })
}

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Compute the 32-byte canonical hash of a TranaIntent.
 * This becomes the WebAuthn challenge — it cryptographically binds the
 * passkey signature to the exact authorized action.
 *
 * Canonical binary encoding (deterministic, reproducible onchain):
 *   version (u8)
 *   domain (u16-LE length + UTF-8 bytes)
 *   cluster (u16-LE length + UTF-8 bytes)
 *   wallet (32 bytes, decoded from base58)
 *   guardProgramId (32 bytes)
 *   targetProgramId (32 bytes)
 *   policyId (u16-LE length + UTF-8 bytes)
 *   instructionDiscriminator (8 bytes, hex-decoded)
 *   accountsHash (32 bytes, hex-decoded)
 *   paramsHash (32 bytes, hex-decoded)
 *   nonce (8 bytes u64 LE)
 *   expiryUnix (8 bytes i64 LE)
 *
 * Replay prevention: nonce + expiryUnix + exact intent binding mean old
 * proofs cannot be reused — the onchain program increments nonce after
 * each valid approval and rejects proofs past their expiry.
 */
export function hashIntent(intent: TranaIntent): Uint8Array {
  const enc    = new TextEncoder()
  const domain  = enc.encode(intent.domain)
  const cluster = enc.encode(intent.cluster)
  const policy  = enc.encode(intent.policyId)

  const walletBytes     = new PublicKey(intent.wallet).toBytes()
  const guardBytes      = new PublicKey(intent.guardProgramId).toBytes()
  const targetBytes     = new PublicKey(intent.targetProgramId).toBytes()
  const discrimBytes    = Buffer.from(intent.instructionDiscriminator, "hex")
  const accountsBytes   = Buffer.from(intent.accountsHash, "hex")
  const paramsBytes     = Buffer.from(intent.paramsHash, "hex")

  const nonceBuf   = Buffer.allocUnsafe(8)
  new DataView(nonceBuf.buffer, nonceBuf.byteOffset, 8).setBigUint64(0, BigInt(intent.nonce), true)
  const expiryBuf  = Buffer.allocUnsafe(8)
  new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(intent.expiryUnix), true)

  const lenBuf = (n: number) => {
    const b = Buffer.allocUnsafe(2)
    new DataView(b.buffer, b.byteOffset, 2).setUint16(0, n, true)
    return b
  }

  const payload = Buffer.concat([
    Buffer.from([intent.version]),  // u8
    lenBuf(domain.length),  Buffer.from(domain),
    lenBuf(cluster.length), Buffer.from(cluster),
    walletBytes,
    guardBytes,
    targetBytes,
    lenBuf(policy.length),  Buffer.from(policy),
    discrimBytes,
    accountsBytes,
    paramsBytes,
    nonceBuf,
    expiryBuf,
  ])

  return sha256Bytes(payload)
}

/** Alias for backward compatibility */
export const intentToPayloadHash = hashIntent
