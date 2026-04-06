import { PublicKey } from "@solana/web3.js"
import { computePayloadHash } from "../secp256r1"

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A frozen, serialisable description of the action being authorized.
 * Built once before the WebAuthn ceremony begins so the challenge (= payload hash)
 * is fully determined before `navigator.credentials.get()` is called.
 */
export type TranaIntent = {
  readonly version:       1
  readonly domain:        "trana:v1"
  readonly wallet:        string   // base58
  readonly guardProgramId: string  // base58
  readonly policy:        string   // "AdminAction" | "HighValueTransfer" | etc.
  readonly nonce:         bigint
  readonly expiryUnix:    number
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build a frozen TranaIntent from the required parameters.
 * `expiryTtlSec` defaults to 120 seconds from now.
 */
export function buildIntent(
  wallet:         PublicKey,
  guardProgramId: PublicKey,
  policy:         string,
  nonce:          bigint,
  expiryTtlSec =  120
): TranaIntent {
  return Object.freeze({
    version:       1 as const,
    domain:        "trana:v1" as const,
    wallet:        wallet.toBase58(),
    guardProgramId: guardProgramId.toBase58(),
    policy,
    nonce,
    expiryUnix:    Math.floor(Date.now() / 1000) + expiryTtlSec,
  })
}

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Compute the 32-byte payload hash for a TranaIntent.
 * This is the WebAuthn challenge — it binds the passkey signature to the
 * exact action parameters (policy, nonce, expiry, program).
 *
 * Uses `computePayloadHash` from secp256r1.ts for consistency with the
 * onchain program's hash computation.
 */
export function intentToPayloadHash(intent: TranaIntent): Uint8Array {
  return computePayloadHash(
    intent.domain,
    intent.wallet,
    intent.guardProgramId,
    intent.policy,
    Number(intent.nonce),   // computePayloadHash takes number; nonce fits in 53-bit safe int
    intent.expiryUnix
  )
}
