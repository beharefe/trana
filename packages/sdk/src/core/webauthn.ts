// Copyright 2025 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Native WebAuthn integration — no third-party browser library.
 *
 * Calls `navigator.credentials.create()` and `navigator.credentials.get()`
 * directly, exposing the raw `authenticatorData` and `clientDataJSON` bytes
 * that the secp256r1 precompile requires. No custom modal, no framework widget —
 * the native OS/browser passkey UI (Touch ID, Face ID, Windows Hello, YubiKey)
 * is shown directly.
 *
 * Environment support:
 *   Web browsers — fully supported
 *   Node.js       — IN PROGRESS: use `@tranaprotocol/sdk/testing` for Node test environments
 *   React Native  — IN PROGRESS: device-specific WebAuthn wrappers planned
 *
 * Device hints / conditional UI:
 *   IN PROGRESS: platform authenticator selection, cross-device flow detection,
 *   and resident-key vs server-side credential selection are not yet configurable.
 */

import type { PasskeyHandle } from "./types"

// ── Registration ──────────────────────────────────────────────────────────────

export type RegistrationResult = PasskeyHandle  // pubkeyBytes + credentialId

/**
 * Register a new passkey with the platform authenticator.
 *
 * Triggers the native OS passkey/FIDO2 creation dialog (Touch ID, Face ID,
 * Windows Hello, YubiKey, etc.) — no custom UI shown by the SDK.
 *
 * @param rpId            Relying party ID — must match the current domain.
 *                        Use `window.location.hostname` in browser code.
 * @param userId          Stable identifier for this user — the owner wallet's
 *                        32-byte public key is a good choice.
 * @param userDisplayName Human-readable label shown by the authenticator (e.g. wallet address).
 *
 * @returns `pubkeyBytes` to store in the on-chain registry,
 *          `credentialId` to store locally for future signing.
 */
export async function registerPasskey(
  rpId:            string,
  userId:          Uint8Array,
  userDisplayName: string,
): Promise<RegistrationResult> {
  assertWebAuthnAvailable()

  const challenge = randomBytes(32)

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge:  challenge  as unknown as BufferSource,
      rp: { id: rpId, name: "Trana" },
      user: {
        id:          userId as unknown as BufferSource,
        name:        userDisplayName,
        displayName: userDisplayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256 (P-256) — the only algorithm we support
      ],
      authenticatorSelection: {
        userVerification: "required",   // UV flag must be set for on-chain enforcement
        residentKey:      "preferred",  // prefer resident/discoverable credentials
      },
      attestation: "none",
      timeout:     60_000,
    },
  }) as PublicKeyCredential | null

  if (!credential) throw new TranaWebAuthnError("cancelled", "Passkey creation cancelled by user")

  const resp = credential.response as AuthenticatorAttestationResponse
  const spki = resp.getPublicKey()
  if (!spki) {
    throw new TranaWebAuthnError(
      "unsupported",
      "Authenticator did not return a public key — ensure ES256/P-256 is supported",
    )
  }

  return {
    pubkeyBytes:  spkiToCompressedKey(new Uint8Array(spki)),
    credentialId: new Uint8Array(credential.rawId),
  }
}

// ── Signing (authentication) ──────────────────────────────────────────────────

export type SigningResult = {
  /** Raw `authenticatorData` bytes from the assertion response. */
  authenticatorData: Uint8Array
  /** Raw `clientDataJSON` bytes from the assertion response. */
  clientDataJSON:    Uint8Array
  /** 64-byte compact (r‖s) low-S signature — ready for `buildSecp256r1Ix()`. */
  signature:         Uint8Array
}

/**
 * Sign an intent hash with an existing passkey credential.
 *
 * The `challenge` (= `hashIntent(intent)`) is embedded as the WebAuthn challenge,
 * binding the passkey signature to the exact authorized transaction.
 *
 * Triggers the native passkey authentication prompt.
 *
 * @param challenge    32-byte intent hash from `hashIntent()`
 * @param credentialId `credentialId` returned by `registerPasskey()`
 * @param rpId         Must match the `rpId` used during registration
 */
export async function signIntent(
  challenge:    Uint8Array,
  credentialId: Uint8Array,
  rpId:         string,
): Promise<SigningResult> {
  assertWebAuthnAvailable()

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge:        challenge    as unknown as BufferSource,
      rpId,
      allowCredentials: [{ type: "public-key", id: credentialId as unknown as BufferSource }],
      userVerification: "required",
      timeout: 60_000,
    },
  }) as PublicKeyCredential | null

  if (!assertion) throw new TranaWebAuthnError("cancelled", "Passkey authentication cancelled by user")

  const resp              = assertion.response as AuthenticatorAssertionResponse
  const authenticatorData = new Uint8Array(resp.authenticatorData)
  const clientDataJSON    = new Uint8Array(resp.clientDataJSON)
  const derSignature      = new Uint8Array(resp.signature)

  const compact = derToCompact(derSignature)
  const lowS    = normalizeLowS(compact)

  return { authenticatorData, clientDataJSON, signature: lowS }
}

// ── SPKI → compressed P-256 key ───────────────────────────────────────────────

/**
 * Extract a 33-byte compressed P-256 public key from an SPKI DER buffer.
 *
 * `AuthenticatorAttestationResponse.getPublicKey()` returns SPKI-encoded bytes.
 * For P-256 (OID 1.2.840.10045.3.1.7), the structure is:
 *   SEQUENCE { SEQUENCE { OID ecPublicKey; OID P-256 }; BIT STRING { 0x04|X|Y } }
 *
 * We scan for the 0x04 uncompressed point marker and derive compressed form.
 */
function spkiToCompressedKey(spki: Uint8Array): Uint8Array {
  for (let i = 0; i <= spki.length - 65; i++) {
    if (spki[i] === 0x04) {
      const x = spki.slice(i + 1,  i + 33)
      const y = spki.slice(i + 33, i + 65)
      const compressed = new Uint8Array(33)
      compressed[0] = y[31] & 1 ? 0x03 : 0x02
      compressed.set(x, 1)
      return compressed
    }
  }
  throw new TranaWebAuthnError("unsupported", "SPKI: P-256 uncompressed point not found — is this a P-256 key?")
}

// ── DER → compact signature ───────────────────────────────────────────────────

/**
 * Convert a DER-encoded ECDSA signature (from WebAuthn) to 64-byte compact (r‖s).
 *
 * DER ECDSA: 0x30 <total> 0x02 <r-len> <r> 0x02 <s-len> <s>
 * DER integers may have a leading 0x00 padding byte when the MSB is set.
 */
function derToCompact(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new TranaWebAuthnError("invalid_signature", "DER: expected SEQUENCE (0x30)")

  let offset = 2  // skip 0x30 + total-length

  if (der[offset] !== 0x02) throw new TranaWebAuthnError("invalid_signature", "DER: expected INTEGER for r")
  offset++
  const rLen = der[offset++]
  const r    = der.slice(offset, offset + rLen)
  offset += rLen

  if (der[offset] !== 0x02) throw new TranaWebAuthnError("invalid_signature", "DER: expected INTEGER for s")
  offset++
  const sLen = der[offset++]
  const s    = der.slice(offset, offset + sLen)

  const compact = new Uint8Array(64)
  // DER integers may be 33 bytes (leading 0x00 for sign bit) — strip and right-align
  const rData = r.length > 32 ? r.slice(r.length - 32) : r
  const sData = s.length > 32 ? s.slice(s.length - 32) : s
  compact.set(rData, 32 - rData.length)
  compact.set(sData, 64 - sData.length)
  return compact
}

// ── Low-S normalization ───────────────────────────────────────────────────────

/**
 * Normalize a compact P-256 signature to low-S form.
 * The secp256r1 precompile rejects high-S signatures (malleable form).
 * Modern browsers produce low-S, but this is a required safety check.
 */
function normalizeLowS(compact: Uint8Array): Uint8Array {
  const N     = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
  const halfN = N >> 1n
  const s     = hexToBigInt(compact.slice(32))
  if (s <= halfN) return compact
  const sLow = N - s
  const out  = new Uint8Array(64)
  out.set(compact.slice(0, 32))
  const hex  = sLow.toString(16).padStart(64, "0")
  for (let i = 0; i < 32; i++) out[32 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function assertWebAuthnAvailable(): void {
  if (typeof navigator === "undefined" || !navigator.credentials?.create) {
    // IN PROGRESS: Node.js support — use `@tranaprotocol/sdk/testing` for Node test environments
    throw new TranaWebAuthnError(
      "unavailable",
      "WebAuthn not available. Run in a browser environment. " +
      "For Node.js / test environments, use @tranaprotocol/sdk/testing instead.",
    )
  }
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function hexToBigInt(bytes: Uint8Array): bigint {
  let hex = ""
  for (const b of bytes) hex += b.toString(16).padStart(2, "0")
  return BigInt("0x" + hex)
}

// ── Error type ────────────────────────────────────────────────────────────────

export type WebAuthnErrorCode =
  | "unavailable"
  | "cancelled"
  | "unsupported"
  | "invalid_signature"

export class TranaWebAuthnError extends Error {
  constructor(
    public readonly code: WebAuthnErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "TranaWebAuthnError"
  }
}
