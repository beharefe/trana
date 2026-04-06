"use client"

import { useCallback } from "react"
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { buildSecp256r1Ix, buildWebAuthnMessage } from "../secp256r1"
import { fetchRegistry } from "./registry"
import { buildIntent, intentToPayloadHash } from "./intent"
import { parseTranaError, TranaErrorKind } from "./error"
import { useTranaContext } from "./provider"

// ── Instruction insertion helpers ─────────────────────────────────────────────

const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111")

function isNonceAdvance(ix: TransactionInstruction): boolean {
  return (
    ix.programId.equals(SystemProgram.programId) &&
    ix.data.length >= 4 &&
    ix.data.readUInt32LE(0) === 4  // AdvanceNonceAccount type
  )
}

/**
 * Insert the secp256r1 proof instruction at the correct position.
 * Preserves: durable nonce advance at index 0, ComputeBudget instructions after it.
 */
function insertProofIx(tx: Transaction, proofIx: TransactionInstruction): void {
  const ixs = tx.instructions
  let at = 0
  if (ixs[0] && isNonceAdvance(ixs[0])) at = 1
  while (at < ixs.length && ixs[at].programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) at++
  ixs.splice(at, 0, proofIx)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useTrana — the primary integration point.
 *
 * Returns `send(tx)` which wraps wallet.sendTransaction with automatic
 * Trana enforcement resolution:
 *
 *   1. Try  — send tx normally
 *   2. Detect — if Trana error: no-registry or missing-proof
 *   3. Resolve — register passkey if needed, then approval modal
 *   4. Retry  — inject secp256r1 proof, refresh blockhash, re-send
 *
 * Usage:
 *   const { send } = useTrana()
 *   await send(myTransaction)
 */
export function useTrana() {
  const ctx = useTranaContext()
  const { connection: walletConn } = useConnection()
  const { publicKey, sendTransaction: walletSend, signTransaction } = useWallet()

  const send = useCallback(async (
    tx:   Transaction | VersionedTransaction,
    conn?: Connection,
    opts?: Parameters<ReturnType<typeof useWallet>["sendTransaction"]>[2]
  ): Promise<string> => {
    if (!publicKey) throw new Error("Wallet not connected")
    const connection = conn ?? walletConn ?? ctx.connection

    // ── Step 1: Try ───────────────────────────────────────────────────────────
    let errorKind: TranaErrorKind | null = null
    try {
      return await walletSend(tx, connection, opts)
    } catch (err: unknown) {
      errorKind = parseTranaError(err)
      if (!errorKind) throw err  // not a Trana error — rethrow untouched
    }

    // ── Step 2 & 3: Resolve ───────────────────────────────────────────────────

    // Register passkey if no registry PDA exists yet (lazy registration)
    if (errorKind === "no-registry") {
      await ctx._triggerRegistration()
    }

    // Fetch fresh registry (after possible registration)
    const registry = await fetchRegistry(connection, publicKey, ctx.config.guardProgramId)
    if (!registry) throw new Error("Trana: registry PDA not found")

    // Build intent and get passkey approval
    const intent   = buildIntent(publicKey, ctx.config.guardProgramId, ctx.config.policy, registry.nonce, ctx.config.expiryTtlSec)
    const approval = await ctx._triggerApproval(intent)

    // Build secp256r1 verify instruction from approval
    const payloadHash = intentToPayloadHash(intent)
    const webAuthnMsg = buildWebAuthnMessage(approval.authenticatorData, approval.clientDataJSON)
    const proofIx     = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)

    // ── Step 4: Retry with proof ──────────────────────────────────────────────
    if (!(tx instanceof Transaction)) {
      // VersionedTransaction: inject is non-trivial — rethrow with guidance
      throw new Error(
        "Trana: VersionedTransaction proof injection is not yet supported. " +
        "Use Transaction or call trana.resolve() to obtain the proof instruction manually."
      )
    }

    insertProofIx(tx, proofIx)
    const { blockhash } = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = blockhash

    if (signTransaction) {
      const signed = await signTransaction(tx)
      return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false })
    }

    // Wallet doesn't expose signTransaction separately — let it re-sign
    return walletSend(tx, connection, opts)
  }, [publicKey, walletSend, signTransaction, walletConn, ctx])

  return { send }
}
