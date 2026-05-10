// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Trana SDK — test utilities for Node.js / Anchor test environments.
 *
 * In tests there is no browser and no hardware passkey device.
 * These helpers let you:
 *   1. Generate a software P-256 keypair (same curve as Touch ID / Face ID)
 *   2. Build a valid secp256r1 proof instruction for any TranaIntent
 *      without running a WebAuthn ceremony
 *
 * The proof is cryptographically identical to what a real browser passkey
 * would produce — the secp256r1 precompile cannot distinguish them.
 * Only use these in tests, never in production.
 *
 * Import via:
 *   import { generateTestPasskey, buildTestProofIx } from "@tranaprotocol/sdk/testing"
 */

import { p256 } from "@noble/curves/nist"
import { TransactionInstruction } from "@solana/web3.js"
import { sha256Bytes } from "../core/sha256"
import { buildSecp256r1Ix, buildWebAuthnMessage } from "../core/secp256r1"
import { hashIntent } from "../core/intent"
import type { TranaIntent } from "../core/intent"

// ── Keypair ───────────────────────────────────────────────────────────────────

export type TestPasskeyHandle = {
  /** 33-byte compressed P-256 public key — store this in the registry PDA. */
  pubkey:       Uint8Array
  /** Raw 32-byte private key — keep this in your test only. */
  privKey:      Uint8Array
  /** Arbitrary credential ID — pass to `registerTwoFa`. */
  credentialId: Uint8Array
}

/**
 * Generate a fresh software P-256 keypair for testing.
 *
 * Usage in Anchor tests:
 *   const passkey = generateTestPasskey()
 *   await program.methods.registerTwoFa(
 *     { secp256R1Passkey: {} },
 *     Buffer.from(passkey.pubkey),
 *     Buffer.from(passkey.credentialId),
 *   ).accounts({ ... }).rpc()
 */
export function generateTestPasskey(): TestPasskeyHandle {
  const privKey = p256.utils.randomSecretKey()
  return {
    pubkey:       p256.getPublicKey(privKey, true),  // 33-byte compressed
    privKey,
    credentialId: new Uint8Array(16).fill(0xca),     // arbitrary, non-empty
  }
}

// ── Proof instruction ─────────────────────────────────────────────────────────

/**
 * Build a secp256r1 proof instruction for a `TranaIntent` without a browser.
 *
 * Constructs minimal but structurally valid WebAuthn data:
 *   - authenticatorData: 37 bytes (rpIdHash + flags + signCount)
 *   - clientDataJSON: `{"type":"webauthn.get","challenge":"<base64url>","origin":"..."}`
 *
 * Then computes the ECDSA e-value exactly as a real passkey would:
 *   e = SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
 *
 * Signs `e` with noble/curves `p256.sign()` — producing the same output
 * the secp256r1 precompile expects (verify_prehash mode, 32-byte message).
 *
 * @param intent  Frozen `TranaIntent` (build with `buildIntent()`).
 * @param handle  From `generateTestPasskey()`.
 * @param rpId    Relying party ID (defaults to `"localhost"`).
 */
export function buildTestProofIx(
  intent: TranaIntent,
  handle: TestPasskeyHandle,
  rpId = "localhost",
): TransactionInstruction {
  const challenge = hashIntent(intent)

  // Minimal authenticatorData (37 bytes): rpIdHash + flags + counter
  const rpIdHash = sha256Bytes(new TextEncoder().encode(rpId))
  const authData = new Uint8Array(37)
  authData.set(rpIdHash, 0)
  authData[32] = 0x05  // UP (bit 0) + UV (bit 2)

  const clientDataJSON = new TextEncoder().encode(JSON.stringify({
    type:        "webauthn.get",
    challenge:   Buffer.from(challenge).toString("base64url"),
    origin:      `http://${rpId}`,
    crossOrigin: false,
  }))

  // e = SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
  const eValue = buildWebAuthnMessage(authData, clientDataJSON)

  const sig = Uint8Array.from(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p256.sign(eValue, handle.privKey) as any).toCompactRawBytes(),
  )

  return buildSecp256r1Ix(handle.pubkey, sig, eValue)
}

// ── Low-S normalization ───────────────────────────────────────────────────────

/**
 * Low-S normalize a compact (r‖s) signature if needed.
 * The secp256r1 precompile rejects high-S signatures.
 * `noble/curves p256.sign()` always produces low-S, so this is a no-op in tests,
 * but call it to match production behavior.
 */
export function ensureLowS(compactSig: Uint8Array): Uint8Array {
  const N     = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
  const halfN = N >> 1n
  const s     = BigInt("0x" + Buffer.from(compactSig.slice(32)).toString("hex"))
  if (s <= halfN) return compactSig
  const sLow = N - s
  const out  = new Uint8Array(64)
  out.set(compactSig.slice(0, 32))
  Buffer.from(sLow.toString(16).padStart(64, "0"), "hex").copy(Buffer.from(out), 32)
  return out
}
