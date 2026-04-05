import { NextRequest, NextResponse } from "next/server"
import { storeChallenge } from "@/lib/db"
import { createRegistrationOptions } from "@/lib/webauthn"
import { randomBytes } from "crypto"

/**
 * POST /api/register/options
 * Body: { wallet: string }
 *
 * Generates WebAuthn registration options and stores the challenge in Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { wallet } = body as { wallet: string }
    if (!wallet) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 })
    }

    // Generate a random challenge and store it so we can verify later.
    const challenge = randomBytes(32).toString("base64url")
    await storeChallenge(wallet, challenge)

    const options = await createRegistrationOptions(wallet, challenge)

    return NextResponse.json({ options })
  } catch (err) {
    console.error("[register/options]", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
