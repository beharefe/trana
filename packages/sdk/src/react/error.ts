/**
 * Trana error detection from failed Solana transactions.
 *
 * When enforce() rejects onchain, the guard program logs a stable marker string.
 * We look for these markers in the transaction error logs (SendTransactionError.logs)
 * so the SDK can detect Trana failures without relying solely on simulation.
 *
 * The onchain program must emit:
 *   msg!("TRANA_NO_REGISTRY")   — no registry PDA exists for this wallet
 *   msg!("TRANA_MISSING_PROOF") — proof instruction absent or invalid
 */

export type TranaErrorKind = "no-registry" | "missing-proof"

const MARKERS: [string, TranaErrorKind][] = [
  ["TRANA_NO_REGISTRY",   "no-registry"],
  ["TRANA_MISSING_PROOF", "missing-proof"],
]

/**
 * Returns the Trana error kind if the error is from Trana enforcement, else null.
 * Checks error.logs[] (SendTransactionError) and error.message as fallback.
 */
export function parseTranaError(error: unknown): TranaErrorKind | null {
  if (!error || typeof error !== "object") return null

  // Primary: SendTransactionError from @solana/web3.js carries logs[]
  const logs: string[] = (error as any).logs ?? []
  for (const log of logs) {
    for (const [marker, kind] of MARKERS) {
      if (log.includes(marker)) return kind
    }
  }

  // Fallback: message string (some wallets stringify the error)
  const msg: string = (error as any).message ?? ""
  for (const [marker, kind] of MARKERS) {
    if (msg.includes(marker)) return kind
  }

  return null
}

export function isTranaError(error: unknown): boolean {
  return parseTranaError(error) !== null
}
