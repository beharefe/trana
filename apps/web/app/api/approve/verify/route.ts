import { NextRequest, NextResponse } from "next/server"
import { getCredential, findChallengeByValue, updateCounter } from "@/lib/db"
import { verifyAuthentication } from "@/lib/webauthn"
import { signPayloadHash, getServerPublicKeyBase58, sha256 } from "@/lib/crypto"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"

/**
 * POST /api/approve/verify
 * Body: { assertion: AuthenticationResponseJSON, canonicalJson: string }
 *
 * Trust model:
 *   1. Verify the WebAuthn assertion   (passkey proves to bridge)
 *   2. Sign sha256(canonicalJson)      (bridge proves to chain)
 *   3. Return the Ed25519 signature    (client attaches the verify instruction)
 *
 * The `canonicalJson` is the deterministic JSON string of the ProofPayload
 * (or VaultProofPayload). The bridge recomputes its hash and verifies it
 * matches the challenge used in the WebAuthn ceremony.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { assertion, canonicalJson } = body as {
      assertion: AuthenticationResponseJSON
      canonicalJson: string
    }

    if (!assertion || !canonicalJson) {
      return NextResponse.json(
        { error: "assertion and canonicalJson required" },
        { status: 400 }
      )
    }

    // Recompute the payloadHash from the canonical JSON.
    const payloadHash    = sha256(canonicalJson)
    const payloadHashHex = Buffer.from(payloadHash).toString("hex")

    // Retrieve the challenge that was stored during /approve/options.
    // The challenge value == payloadHashHex.
    const stored = await findChallengeByValue(payloadHashHex)
    if (!stored) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 400 }
      )
    }

    const wallet = stored.wallet
    if (wallet === "__global__" && !stored) {
      return NextResponse.json({ error: "No credential found" }, { status: 404 })
    }

    const cred = wallet !== "__global__" ? await getCredential(wallet) : null
    if (!cred) {
      return NextResponse.json(
        { error: "No passkey registered for this wallet" },
        { status: 404 }
      )
    }

    // Verify the WebAuthn assertion.
    const verification = await verifyAuthentication(assertion, cred, payloadHashHex)
    if (!verification.verified) {
      return NextResponse.json(
        { error: "WebAuthn verification failed" },
        { status: 401 }
      )
    }

    // Update the credential counter to prevent authenticator cloning.
    await updateCounter(wallet, verification.authenticationInfo.newCounter)

    // Sign the payloadHash with the bridge's Ed25519 server key.
    // This is what the Anchor program verifies onchain.
    const signature = signPayloadHash(payloadHash)

    return NextResponse.json({
      signature:    Buffer.from(signature).toString("base64"),
      serverPubkey: getServerPublicKeyBase58(),
      payloadHash:  payloadHashHex,
    })
  } catch (err) {
    console.error("[approve/verify]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
