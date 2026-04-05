import { NextRequest, NextResponse } from "next/server"
import { getCredential, findChallengeByValue, updateCounter } from "@/lib/db"
import { verifyAuthentication } from "@/lib/webauthn"
import { signPayloadHash, getServerPublicKeyBase58, sha256 } from "@/lib/crypto"
import type { ProofPayload } from "@trana-guard/sdk"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"

/**
 * POST /api/approve/verify
 * Body: { assertion: AuthenticationResponseJSON, payload: ProofPayload }
 *
 * Trust model:
 *   1. Verify the WebAuthn assertion (passkey proves to bridge)
 *   2. Sign the payload hash with the server Ed25519 key (bridge proves to chain)
 *   3. Return the signature so the client can attach the Ed25519 verify ix
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { assertion, payload } = body as {
      assertion: AuthenticationResponseJSON
      payload: ProofPayload
    }

    if (!assertion || !payload) {
      return NextResponse.json({ error: "assertion and payload required" }, { status: 400 })
    }

    // Derive the wallet from the programId field (MVP: programId == wallet for simplicity)
    // In a full integration the wallet would be passed separately.
    const wallet = payload.programId

    const cred = await getCredential(wallet)
    if (!cred) {
      return NextResponse.json({ error: "No passkey registered for this wallet" }, { status: 404 })
    }

    // Recompute the expected payloadHash.
    const canonicalJson = JSON.stringify({
      programId: payload.programId,
      instruction: payload.instruction,
      amount: payload.amount,
      nonce: payload.nonce,
      expiry: payload.expiry,
    })
    const payloadHash = sha256(canonicalJson)
    const payloadHashHex = Buffer.from(payloadHash).toString("hex")

    // Retrieve stored challenge and verify it matches the payload.
    const stored = await findChallengeByValue(payloadHashHex)
    if (!stored || stored.wallet !== wallet) {
      return NextResponse.json({ error: "Invalid or expired challenge" }, { status: 400 })
    }

    // Verify the WebAuthn assertion.
    const verification = await verifyAuthentication(assertion, cred, payloadHashHex)
    if (!verification.verified) {
      return NextResponse.json({ error: "WebAuthn verification failed" }, { status: 401 })
    }

    // Update the credential counter to prevent authenticator cloning.
    await updateCounter(wallet, verification.authenticationInfo.newCounter)

    // Sign the payloadHash with the server Ed25519 key.
    // This is what the Anchor program will verify onchain.
    const signature = signPayloadHash(payloadHash)

    return NextResponse.json({
      signature: Buffer.from(signature).toString("base64"),
      serverPubkey: getServerPublicKeyBase58(),
      payloadHash: payloadHashHex,
    })
  } catch (err) {
    console.error("[approve/verify]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
