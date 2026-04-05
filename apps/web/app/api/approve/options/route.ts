import { NextRequest, NextResponse } from "next/server"
import { storeChallenge } from "@/lib/db"
import { createAuthenticationOptions } from "@/lib/webauthn"

/**
 * POST /api/approve/options
 * Body: { payloadHash: string (hex), wallet?: string }
 *
 * The payloadHash is used as the WebAuthn challenge so the authenticator
 * signs exactly the payload the bridge will later countersign with Ed25519.
 *
 * wallet is optional — used to find the credential ID for allowCredentials
 * (avoids "choose authenticator" UI in browsers that support it).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { payloadHash, wallet } = body as {
      payloadHash: string
      wallet?: string
    }

    if (!payloadHash) {
      return NextResponse.json({ error: "payloadHash required" }, { status: 400 })
    }

    // Store the challenge so /approve/verify can retrieve and invalidate it.
    await storeChallenge(wallet ?? "__global__", payloadHash)

    // If wallet provided, pass its credential ID for allowCredentials hint.
    let credentialId: string | undefined
    if (wallet) {
      const { getCredential } = await import("@/lib/db")
      const cred = await getCredential(wallet)
      credentialId = cred?.credential_id
    }

    const options = await createAuthenticationOptions(payloadHash, credentialId)

    return NextResponse.json({ options })
  } catch (err) {
    console.error("[approve/options]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
