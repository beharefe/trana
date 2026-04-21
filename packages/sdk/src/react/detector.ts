import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js"
import { SECP256R1_PROGRAM_ID } from "../secp256r1"
import { findRegistryPda } from "./registry"

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetectionResult =
  | { needed: false }
  | { needed: true; reason: "no-registry";   policy: string }
  | { needed: true; reason: "missing-proof"; policy: string }

// Log prefixes emitted by the guard program
const TRANA_REQUIRE_PREFIX     = "TRANA require | policy="
const TRANA_MISSING_PROOF_MARKER = "TRANA_MISSING_PROOF"

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fast path: check if the transaction already contains a secp256r1 verify
 * instruction. If it does, no prompt needed — skip simulation entirely.
 */
export function hasSecp256r1Ix(
  tx: Transaction | VersionedTransaction
): boolean {
  if (tx instanceof Transaction) {
    return tx.instructions.some(ix => ix.programId.equals(SECP256R1_PROGRAM_ID))
  }
  const { staticAccountKeys } = (tx as VersionedTransaction).message
  return (tx as VersionedTransaction).message.compiledInstructions.some(ix => {
    const programKey = staticAccountKeys[ix.programIdIndex]
    return programKey?.equals(SECP256R1_PROGRAM_ID)
  })
}

/**
 * Extract the policy string from a "TRANA require | policy=X | ..." log line.
 * Returns the policy string (e.g. "trana.threshold") or null if not found.
 */
export function parsePolicyFromLogs(logs: string[]): string | null {
  for (const line of logs) {
    const idx = line.indexOf(TRANA_REQUIRE_PREFIX)
    if (idx === -1) continue
    const after = line.slice(idx + TRANA_REQUIRE_PREFIX.length)
    // policy value runs up to next " | " separator or end of string
    const end = after.indexOf(" | ")
    return end === -1 ? after.trim() : after.slice(0, end).trim()
  }
  return null
}

// ── Simulation-based detection ────────────────────────────────────────────────

/**
 * Detect whether a transaction requires Trana enforcement, and if so,
 * which policy fired.
 *
 * Flow:
 *   1. Static check — proof already present? Done.
 *   2. Simulate without wallet signature or valid blockhash.
 *      Look for "TRANA require | policy=X" to find the fired policy.
 *      Look for "TRANA_MISSING_PROOF" to confirm enforcement is required.
 *   3. Check registry PDA to determine whether the user needs to register first.
 *
 * The policy string extracted here is passed directly into buildIntent() so
 * the intent hash matches what the guard program expects.
 */
export async function detectEnforcement(
  tx:             Transaction | VersionedTransaction,
  connection:     Connection,
  walletPubkey:   PublicKey,
  guardProgramId: PublicKey,
  fallbackPolicy: string,
): Promise<DetectionResult> {
  // Stage 1: proof already present → nothing to do
  if (hasSecp256r1Ix(tx)) return { needed: false }

  // Stage 2: simulate — replaceRecentBlockhash so we don't need a live blockhash,
  //          sigVerify: false so wallet doesn't need to sign for detection.
  let logs: string[] = []
  try {
    const vtx = tx instanceof Transaction
      ? VersionedTransaction.deserialize(
          tx.serialize({ requireAllSignatures: false, verifySignatures: false })
        )
      : (tx as VersionedTransaction)
    const result = await connection.simulateTransaction(vtx, {
      replaceRecentBlockhash: true,
      sigVerify:              false,
    })
    logs = result.value.logs ?? []
  } catch {
    return { needed: false }
  }

  const needsProof = logs.some(line => line.includes(TRANA_MISSING_PROOF_MARKER))
  if (!needsProof) return { needed: false }

  // Extract the specific policy that fired so the intent hash is exact.
  // Falls back to the configured policy if the log isn't present.
  const policy = parsePolicyFromLogs(logs) ?? fallbackPolicy

  const pda       = findRegistryPda(walletPubkey, guardProgramId)
  const pdaInfo   = await connection.getAccountInfo(pda)
  const hasRegistry = pdaInfo !== null && pdaInfo.data.length > 8

  return hasRegistry
    ? { needed: true, reason: "missing-proof", policy }
    : { needed: true, reason: "no-registry",   policy }
}
