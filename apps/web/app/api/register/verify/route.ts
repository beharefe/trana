import { NextRequest, NextResponse } from "next/server"
import { findChallengeByValue, upsertCredential } from "@/lib/db"
import { verifyRegistration } from "@/lib/webauthn"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"

/**
 * POST /api/register/verify
 * Body: { wallet: string, response: RegistrationResponseJSON }
 *
 * Verifies the WebAuthn registration ceremony.
 *
 * Role of this endpoint:
 *   UX HELPER ONLY — it is NOT a trust anchor.
 *   It verifies the WebAuthn assertion for UX/anti-spam purposes and stores
 *   the credential for the Ed25519 bridge demo path.
 *
 *   The real security anchor is the onchain registry PDA.
 *   The client must follow up by calling register_two_fa on the Trana program
 *   using the returned p256PublicKey.
 *
 * Returns:
 *   p256PublicKey: hex-encoded 33-byte compressed P-256 public key
 *   credentialId:  base64url credential ID (for allowCredentials hint)
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

    // Store in Supabase for the Ed25519 bridge demo path.
    // This is UX infrastructure — not the security anchor.
    await upsertCredential({
      wallet,
      credential_id: credential.id,
      public_key:    Buffer.from(credential.publicKey),
      counter:       credential.counter,
      opt_in:        false,
    })

    // Return the P-256 public key so the client can call register_two_fa onchain.
    // The client must complete onchain registration — this backend call alone
    // does NOT protect any funds or instructions.
    return NextResponse.json({
      success:        true,
      credentialId:   credential.id,
      // 33-byte compressed P-256 pubkey, hex-encoded
      p256PublicKey:  Buffer.from(credential.publicKey).toString("hex"),
    })
  } catch (err) {
    console.error("[register/verify]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
