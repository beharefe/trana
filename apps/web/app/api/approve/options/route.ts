import { NextRequest, NextResponse } from "next/server"
import { getCredential, storeChallenge } from "@/lib/db"
import { createAuthenticationOptions } from "@/lib/webauthn"

/**
 * POST /api/approve/options
 * Body: { wallet: string, payloadHash: string (hex) }
 *
 * The payloadHash becomes the WebAuthn challenge so that the authenticator
 * signs exactly the payload that the bridge will later verify and countersign.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { wallet, payloadHash } = body as {
      wallet: string
      payloadHash: string
    }

    if (!wallet || !payloadHash) {
      return NextResponse.json({ error: "wallet and payloadHash required" }, { status: 400 })
    }

    const cred = await getCredential(wallet)
    if (!cred) {
      return NextResponse.json({ error: "No passkey registered for this wallet" }, { status: 404 })
    }

    // Store the challenge (= payloadHash) so /approve/verify can retrieve it.
    await storeChallenge(wallet, payloadHash)

    const options = await createAuthenticationOptions(payloadHash, cred.credential_id)

    return NextResponse.json({ options })
  } catch (err) {
    console.error("[approve/options]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
