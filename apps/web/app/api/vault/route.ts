import { Connection, PublicKey } from "@solana/web3.js"
import { NextRequest, NextResponse } from "next/server"

// Server-side uses host.docker.internal; browser uses localhost
const RPC =
  process.env.SOLANA_RPC ??
  process.env.NEXT_PUBLIC_SOLANA_RPC ??
  "http://localhost:8899"

const VAULT_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  "Cm2jPgn1ipUAFarS7DpF2Y1X1HofKZgDKLmH65DtCNrZ"
)

const GUARD_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID ||
  "572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6"
)

// VaultState layout after 8-byte discriminator:
//   owner:                   Pubkey  32
//   balance:                 u64      8
//   opt_in:                  bool     1
//   last_large_deposit_at:   i64      8
//   last_large_deposit_amount: u64    8
function parseVault(data: Buffer) {
  let o = 8                                   // skip discriminator
  o += 32                                     // skip owner
  const balance  = Number(data.readBigUInt64LE(o)); o += 8
  const opt_in   = data[o] === 1;             o += 1
  return { balance_sol: balance / 1e9, opt_in }
}

// TwoFactorRegistry nonce is at offset: 8 disc + 32 owner + 1 kind + 4+pkLen + 4+credLen + 1 enabled
// Use a safe approach: just read nonce from the last 8 bytes of a known-good account
function parseNonce(data: Buffer): number {
  if (data.length < 46) return 0
  // Nonce is u64 LE at the end of the fixed layout; read from offset we can infer
  // Layout: 8 + 32 + 1 + (4+pkLen) + (4+credLen) + 1 + 8
  let o = 8 + 32 + 1
  const pkLen   = data.readUInt32LE(o); o += 4 + pkLen
  const credLen = data.readUInt32LE(o); o += 4 + credLen
  o += 1 // enabled
  return Number(data.readBigUInt64LE(o))
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) return NextResponse.json({ error: "missing wallet" }, { status: 400 })

  try {
    const owner      = new PublicKey(wallet)
    const connection = new Connection(RPC, "confirmed")

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.toBuffer()],
      VAULT_PROGRAM_ID
    )
    const [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("2fa"), owner.toBuffer()],
      GUARD_PROGRAM_ID
    )

    const [vaultInfo, registryInfo] = await Promise.all([
      connection.getAccountInfo(vaultPda),
      connection.getAccountInfo(registryPda),
    ])

    if (!vaultInfo) {
      return NextResponse.json({
        initialized: false,
        balance_sol: 0,
        next_nonce:  0,
        opt_in:      false,
      })
    }

    const { balance_sol, opt_in } = parseVault(Buffer.from(vaultInfo.data))
    const next_nonce = registryInfo
      ? parseNonce(Buffer.from(registryInfo.data))
      : 0

    return NextResponse.json({ initialized: true, balance_sol, next_nonce, opt_in })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
