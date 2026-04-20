/**
 * Browser-side WebAuthn utilities for Trana passkey flows.
 *
 * No backend dependency. All operations run client-side.
 * The secp256r1 precompile + onchain registry PDA are the trust anchors.
 */

// ── DER → compact conversion ─────────────────────────────────────────────────

/**
 * Convert a DER-encoded ECDSA signature to 64-byte compact format (r ‖ s).
 * WebAuthn authenticators produce DER. The secp256r1 precompile requires compact.
 *
 * DER layout: 0x30 [len] 0x02 [r-len] [r-bytes] 0x02 [s-len] [s-bytes]
 */
export function derToCompact(der: Uint8Array): Uint8Array {
  let i = 0
  if (der[i++] !== 0x30) throw new Error("Invalid DER: expected SEQUENCE")
  // Skip length byte(s) — may be long-form
  if (der[i] > 0x80) i += (der[i] - 0x80) + 1
  else i++

  // r
  if (der[i++] !== 0x02) throw new Error("Invalid DER: expected INTEGER for r")
  const rLen = der[i++]
  const rStart = rLen > 32 ? i + 1 : i  // skip leading 0x00 when DER-padded
  const rSize  = rLen > 32 ? 32 : rLen
  const r = der.slice(rStart, rStart + rSize)
  i += rLen

  // s
  if (der[i++] !== 0x02) throw new Error("Invalid DER: expected INTEGER for s")
  const sLen = der[i++]
  const sStart = sLen > 32 ? i + 1 : i
  const sSize  = sLen > 32 ? 32 : sLen
  const s = der.slice(sStart, sStart + sSize)

  const compact = new Uint8Array(64)
  compact.set(r.length < 32 ? padLeft(r, 32) : r, 0)
  compact.set(s.length < 32 ? padLeft(s, 32) : s, 32)
  return compact
}

function padLeft(bytes: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length)
  out.set(bytes, length - bytes.length)
  return out
}

// ── Low-S normalization ───────────────────────────────────────────────────────

/** secp256r1 curve order */
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
const HALF_N = N >> 1n

/**
 * Normalize compact signature to low-S form.
 * The secp256r1 precompile rejects high-S signatures.
 * If s > n/2, replace s with n - s.
 */
export function lowS(compact: Uint8Array): Uint8Array {
  const s = BigInt("0x" + Buffer.from(compact.slice(32)).toString("hex"))
  if (s <= HALF_N) return compact
  const sLow = N - s
  const out = new Uint8Array(64)
  out.set(compact.slice(0, 32))
  const sHex = sLow.toString(16).padStart(64, "0")
  out.set(Buffer.from(sHex, "hex"), 32)
  return out
}

// ── Public key extraction ─────────────────────────────────────────────────────

/**
 * Extract the 33-byte compressed P-256 public key from a WebAuthn attestation.
 *
 * Uses `getPublicKey()` (returns DER SPKI) when available.
 * SPKI layout for P-256: 26-byte prefix + 65-byte uncompressed point (0x04 || x || y).
 */
export function extractPubkeyFromAttestation(
  response: AuthenticatorAttestationResponse
): Uint8Array {
  const spki = response.getPublicKey()
  if (!spki) throw new Error("getPublicKey() returned null — browser unsupported")

  const spkiBytes = new Uint8Array(spki)
  // DER SPKI for P-256: 27-byte header, then 0x04 uncompressed point (65 bytes)
  // Find the 0x04 uncompressed point marker
  let offset = spkiBytes.indexOf(0x04)
  if (offset === -1) throw new Error("Could not find uncompressed point in SPKI")

  const uncompressed = spkiBytes.slice(offset, offset + 65)
  if (uncompressed.length !== 65) {
    throw new Error(`Expected 65-byte uncompressed point, got ${uncompressed.length}`)
  }

  return compressP256(uncompressed)
}

/**
 * Compress an uncompressed P-256 point (0x04 || x || y) to 33-byte SEC1.
 * Prefix: 0x02 if y is even, 0x03 if y is odd.
 */
function compressP256(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed[0] !== 0x04) {
    throw new Error("Expected uncompressed point (0x04 prefix)")
  }
  const x = uncompressed.slice(1, 33)
  const y = uncompressed.slice(33, 65)
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03
  const compressed = new Uint8Array(33)
  compressed[0] = prefix
  compressed.set(x, 1)
  return compressed
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Run a full passkey registration ceremony in the browser.
 * No backend required — challenge is random (security comes from onchain pubkey storage).
 *
 * Returns the 33-byte compressed P-256 public key and credential ID.
 */
export async function doRegistration(rpId?: string): Promise<{
  credentialId: Uint8Array
  pubkey: Uint8Array
}> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        id:   rpId ?? window.location.hostname,
        name: "Trana",
      },
      user: {
        id:          crypto.getRandomValues(new Uint8Array(16)),
        name:        "trana-user",
        displayName: "Trana User",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256 = P-256
      ],
      authenticatorSelection: {
        requireResidentKey:   true,
        residentKey:          "required",
        userVerification:     "required",
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential | null

  if (!credential) throw new Error("Passkey creation cancelled")

  const response = credential.response as AuthenticatorAttestationResponse
  const pubkey   = extractPubkeyFromAttestation(response)
  const credentialId = new Uint8Array(credential.rawId)

  return { credentialId, pubkey }
}

// ── Approval ─────────────────────────────────────────────────────────────────

/**
 * Run a passkey approval ceremony in the browser.
 * The challenge is the Trana payload hash — this binds the signature to the
 * exact transaction parameters (policy, nonce, expiry, program).
 *
 * Returns compact (r‖s) low-S P-256 signature + raw WebAuthn binding bytes
 * for onchain full-binding verification via WebAuthnData mode.
 */
export async function doApproval(
  credentialId: Uint8Array,
  payloadHash:  Uint8Array,
  rpId?:        string
): Promise<{
  sig:               Uint8Array
  authenticatorData: Uint8Array
  clientDataJSON:    Uint8Array
}> {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge:        Buffer.from(payloadHash),
      rpId:             rpId ?? window.location.hostname,
      allowCredentials: [
        { id: Buffer.from(credentialId), type: "public-key" },
      ],
      userVerification: "required",
      timeout:          60000,
    },
  }) as PublicKeyCredential | null

  if (!credential) throw new Error("Passkey approval cancelled")

  const response = credential.response as AuthenticatorAssertionResponse

  // Extract DER signature and convert to compact + low-S
  const derBytes   = new Uint8Array(response.signature)
  const compactSig = lowS(derToCompact(derBytes))

  const authenticatorData = new Uint8Array(response.authenticatorData)
  const clientDataJSON    = new Uint8Array(
    new TextEncoder().encode(
      new TextDecoder().decode(response.clientDataJSON)
    )
  )

  return { sig: compactSig, authenticatorData, clientDataJSON }
}
