import { NextRequest, NextResponse } from "next/server"
import { getCredential, findChallengeByValue, updateCounter } from "@/lib/db"
import { verifyAuthentication } from "@/lib/webauthn"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"

/**
 * POST /api/approve/verify
 * Body: { assertion: AuthenticationResponseJSON, payloadHash: string (hex) }
 *
 * Role of this endpoint:
 *   UX HELPER ONLY — it is NOT a trust anchor.
 *
 *   1. Verifies the WebAuthn assertion (RP ID, origin, counter) — UX safety check.
 *   2. Returns the raw P-256 signature so the CLIENT builds the secp256r1
 *      precompile instruction.
 *   3. Does NOT sign anything with a server key.
 *   4. Does NOT authorize anything — the onchain program does that.
 *
 * The secp256r1 precompile + onchain registry PDA are the trust anchors.
 * A compromised version of this endpoint cannot produce valid onchain proofs.
 *
 * Returns:
 *   verified:          boolean
 *   p256Signature:     base64 64-byte compact P-256 signature (r ‖ s)
 *   authenticatorData: base64 authenticator data bytes
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { assertion, payloadHash } = body as {
      assertion:   AuthenticationResponseJSON
      payloadHash: string  // hex-encoded 32 bytes
    }

    if (!assertion || !payloadHash) {
      return NextResponse.json(
        { error: "assertion and payloadHash required" },
        { status: 400 }
      )
    }

    // Retrieve the stored challenge (= payloadHash) to prevent replay.
    const stored = await findChallengeByValue(payloadHash)
    if (!stored) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 400 }
      )
    }

    const wallet = stored.wallet
    const cred   = wallet !== "__global__" ? await getCredential(wallet) : null
    if (!cred) {
      return NextResponse.json(
        { error: "No passkey registered for this wallet" },
        { status: 404 }
      )
    }

    // Verify the WebAuthn assertion.
    // This checks: RP ID, origin, user presence, counter.
    // These are UX-layer checks — the secp256r1 precompile is the enforcement.
    const verification = await verifyAuthentication(assertion, cred, payloadHash)
    if (!verification.verified) {
      return NextResponse.json(
        { error: "WebAuthn verification failed" },
        { status: 401 }
      )
    }

    // Update counter to detect authenticator cloning (UX safety).
    await updateCounter(wallet, verification.authenticationInfo.newCounter)

    // Extract the raw P-256 signature from the WebAuthn assertion response.
    // The DER-encoded signature needs to be converted to compact (r ‖ s) format
    // for the secp256r1 precompile.
    const rawSigBase64 = assertion.response.signature
    const derBytes     = Buffer.from(rawSigBase64, "base64url")
    const compactSig   = derToCompact(derBytes)

    const authenticatorData = assertion.response.authenticatorData

    return NextResponse.json({
      verified:          true,
      // 64-byte compact P-256 sig (r ‖ s) — for secp256r1 precompile instruction
      p256Signature:     Buffer.from(compactSig).toString("base64"),
      // authenticatorData + clientDataJSON — client passes these to enforce()
      // as WebAuthnData so the onchain program can do full binding verification:
      //   message = authenticatorData || SHA256(clientDataJSON)
      //   challenge in clientDataJSON must match payloadHash
      authenticatorData: assertion.response.authenticatorData,
      clientDataJSON:    assertion.response.clientDataJSON,
    })
  } catch (err) {
    console.error("[approve/verify]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

/**
 * Convert a DER-encoded EC signature to compact (r ‖ s) format.
 * WebAuthn signatures are DER. The secp256r1 precompile expects compact.
 *
 * DER format: 0x30 [total-len] 0x02 [r-len] [r-bytes] 0x02 [s-len] [s-bytes]
 */
function derToCompact(der: Buffer): Uint8Array {
  let i = 0
  if (der[i++] !== 0x30) throw new Error("Invalid DER: expected SEQUENCE")
  // Skip length byte(s)
  if (der[i] > 0x80) i += der[i] - 0x80 + 1
  else i++

  // r
  if (der[i++] !== 0x02) throw new Error("Invalid DER: expected INTEGER for r")
  const rLen = der[i++]
  let   rStart = i
  if (rLen > 32) rStart++  // skip leading 0x00 padding
  const r = der.subarray(rStart, i + rLen - (rLen > 32 ? 1 : 0))
  i += rLen

  // s
  if (der[i++] !== 0x02) throw new Error("Invalid DER: expected INTEGER for s")
  const sLen = der[i++]
  let   sStart = i
  if (sLen > 32) sStart++  // skip leading 0x00 padding
  const s = der.subarray(sStart, i + sLen - (sLen > 32 ? 1 : 0))

  // Pad r and s to 32 bytes each
  const compact = new Uint8Array(64)
  compact.set(r.length < 32 ? padLeft(r, 32) : r, 0)
  compact.set(s.length < 32 ? padLeft(s, 32) : s, 32)
  return compact
}

function padLeft(bytes: Uint8Array | Buffer, length: number): Uint8Array {
  const out = new Uint8Array(length)
  out.set(bytes, length - bytes.length)
  return out
}
