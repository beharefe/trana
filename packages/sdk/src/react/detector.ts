import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js"
import { SECP256R1_PROGRAM_ID } from "../secp256r1"
import { findRegistryPda } from "./registry"

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetectionResult =
  | { needed: false }
  | { needed: true; reason: "no-registry" }   // enforcement required, no PDA → register first
  | { needed: true; reason: "missing-proof" }  // enforcement required, PDA exists → approval modal

/**
 * Log marker emitted by the guard program when enforcement fails.
 * Stable identifier used to distinguish Trana errors from other simulation failures.
 */
const TRANA_MISSING_PROOF_MARKER = "TRANA_MISSING_PROOF"

// ── Static check ─────────────────────────────────────────────────────────────

/**
 * Fast path: check if the transaction already contains a secp256r1 verify
 * instruction. If it does, no prompt is needed — skip simulation entirely.
 */
export function hasSecp256r1Ix(
  tx: Transaction | VersionedTransaction
): boolean {
  const instructions =
    tx instanceof Transaction
      ? tx.instructions
      : tx.message.compiledInstructions

  if (tx instanceof Transaction) {
    return tx.instructions.some(ix =>
      ix.programId.equals(SECP256R1_PROGRAM_ID)
    )
  }

  // VersionedTransaction — check compiled instruction program IDs
  const { staticAccountKeys } = (tx as VersionedTransaction).message
  return (tx as VersionedTransaction).message.compiledInstructions.some(ix => {
    const programKey = staticAccountKeys[ix.programIdIndex]
    return programKey?.equals(SECP256R1_PROGRAM_ID)
  })
}

// ── Simulation-based detection ────────────────────────────────────────────────

/**
 * Detect whether a transaction requires Trana enforcement.
 *
 * Two-stage:
 * 1. Static check — proof already in tx? Done, no enforcement needed.
 * 2. Simulate — look for TRANA_MISSING_PROOF in logs.
 *    If found, check registry PDA to determine reason.
 *
 * Returns DetectionResult indicating what (if anything) the provider must do.
 */
export async function detectEnforcement(
  tx:             Transaction | VersionedTransaction,
  connection:     Connection,
  walletPubkey:   PublicKey,
  guardProgramId: PublicKey
): Promise<DetectionResult> {
  // Stage 1: static check — proof already present
  if (hasSecp256r1Ix(tx)) {
    return { needed: false }
  }

  // Stage 2: simulate to detect enforcement requirement
  let logs: string[] = []
  try {
    let result
    // simulateTransaction only accepts VersionedTransaction with config object;
    // convert legacy Transaction via its serialized form to avoid overload mismatch.
    const vtx = tx instanceof Transaction
      ? VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false }))
      : tx as VersionedTransaction
    result = await connection.simulateTransaction(vtx, {
      replaceRecentBlockhash: true,
      sigVerify:              false,
    })
    logs = result.value.logs ?? []
  } catch {
    // Simulation RPC failure — fall through conservatively (do not prompt)
    return { needed: false }
  }

  const needsProof = logs.some(line => line.includes(TRANA_MISSING_PROOF_MARKER))
  if (!needsProof) return { needed: false }

  // Enforcement is required. Check whether a registry PDA exists.
  const pda       = findRegistryPda(walletPubkey, guardProgramId)
  const pdaInfo   = await connection.getAccountInfo(pda)
  const hasRegistry = pdaInfo !== null && pdaInfo.data.length > 8

  return hasRegistry
    ? { needed: true, reason: "missing-proof" }
    : { needed: true, reason: "no-registry" }
}
