import { NextRequest, NextResponse } from "next/server"
import { getCredential } from "@/lib/db"

/**
 * GET /api/status?wallet=<base58>
 *
 * Returns passkey status for a wallet.
 * This is a UX signal only — not used for onchain enforcement.
 *
 * has_passkey: whether the wallet has a passkey registered in our bridge
 * opt_in:      whether the user opted into always-2FA
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 })
  }

  try {
    const cred = await getCredential(wallet)
    return NextResponse.json({
      has_passkey: cred !== null,
      opt_in: cred?.opt_in ?? false,
    })
  } catch {
    return NextResponse.json({ has_passkey: false, opt_in: false })
  }
}
