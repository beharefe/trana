import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"

const PROGRAM_ID  = process.env.NEXT_PUBLIC_PROGRAM_ID ?? ""
const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com"
const SOL         = 1_000_000_000

/**
 * GET /api/vault?wallet=<base58>
 *
 * Returns onchain vault state for the given wallet:
 *   initialized  — whether the Vault PDA exists
 *   balance_sol  — lamports in the vault (minus rent-exempt minimum), in SOL
 *   next_nonce   — current monotonic nonce
 *   opt_in       — whether the user opted into always-2FA
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 })
  }

  if (!PROGRAM_ID) {
    return NextResponse.json(
      { initialized: false, balance_sol: 0, next_nonce: 0, opt_in: false },
      { status: 200 }
    )
  }

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed")
    const ownerKey   = new PublicKey(wallet)
    const programKey = new PublicKey(PROGRAM_ID)

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ownerKey.toBuffer()],
      programKey
    )

    const accountInfo = await connection.getAccountInfo(vaultPda)
    if (!accountInfo) {
      return NextResponse.json({
        initialized: false,
        balance_sol: 0,
        next_nonce:  0,
        opt_in:      false,
      })
    }

    // Parse VaultState discriminator + fields (8 + 32 + 8 + 1 + 1 = 50 bytes)
    const data        = accountInfo.data
    const ownerBytes  = data.slice(8, 40)     // Pubkey = 32 bytes at offset 8
    const nextNonce   = Number(data.readBigUInt64LE(40)) // u64 at offset 40
    const optIn       = data[48] === 1                   // bool at offset 48

    void ownerBytes // validated via PDA derivation

    // Lamports above rent-exempt minimum are the "deposited" balance.
    const rentExemptMin = await connection.getMinimumBalanceForRentExemption(
      accountInfo.data.length
    )
    const available = Math.max(0, accountInfo.lamports - rentExemptMin)

    return NextResponse.json({
      initialized: true,
      balance_sol: available / SOL,
      next_nonce:  nextNonce,
      opt_in:      optIn,
    })
  } catch (err) {
    console.error("[vault]", err)
    return NextResponse.json({
      initialized: false,
      balance_sol: 0,
      next_nonce:  0,
      opt_in:      false,
    })
  }
}
