import { NextRequest, NextResponse } from "next/server"
import { findChallengeByValue, upsertCredential } from "@/lib/db"
import { verifyRegistration } from "@/lib/webauthn"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"

/**
 * POST /api/register/verify
 * Body: { wallet: string, response: RegistrationResponseJSON }
 *
 * Verifies the WebAuthn registration ceremony and stores the credential.
 * Registration is fully offchain — the chain is never involved.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { wallet, response } = body as {
      wallet: string
      response: RegistrationResponseJSON
    }

    if (!wallet || !response) {
      return NextResponse.json({ error: "wallet and response required" }, { status: 400 })
    }

    // Retrieve the stored challenge.
    // The client sends the challenge embedded in the response's clientDataJSON.
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")
    )
    const challenge = clientData.challenge as string

    const storedChallenge = await findChallengeByValue(challenge)
    if (!storedChallenge || storedChallenge.wallet !== wallet) {
      return NextResponse.json({ error: "Invalid or expired challenge" }, { status: 400 })
    }

    const verification = await verifyRegistration(response, challenge)
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Registration verification failed" }, { status: 400 })
    }

    const { credential } = verification.registrationInfo

    await upsertCredential({
      wallet,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey),
      counter: credential.counter,
      opt_in: false,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[register/verify]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
