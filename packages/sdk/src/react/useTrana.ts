"use client"

import { useCallback } from "react"
import {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx } from "../secp256r1"
import { fetchRegistry } from "./registry"
import { buildIntent, IntentInput } from "./intent"
import { useTranaContext } from "./provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type { IntentInput }

/**
 * Arguments passed to useTrana().authorizeAndSend().
 *
 * Drop-in design — the developer only needs two callbacks:
 *   buildIntent()       — describe the action being authorized
 *   buildTransaction()  — build the Solana transaction (no proof plumbing)
 *
 * The SDK handles everything else:
 *   1. Registry fetch / lazy registration
 *   2. Intent construction (discriminator, accounts, params all auto-derived)
 *   3. Passkey approval modal
 *   4. secp256r1 precompile instruction
 *   5. guard::record_proof instruction (data carrier)
 *   6. Fresh blockhash fetch (after approval)
 *   7. Proof instruction insertion before the protected instruction
 *   8. Single wallet signature + send
 *
 * The developer's transaction contains only application instructions.
 * No proofIx, no authenticatorData, no clientDataJSON — zero Trana plumbing.
 */
export type AuthorizeAndSendArgs = {
  /**
   * Describe the action being authorized.
   * Called after the registry is confirmed to exist.
   * The SDK auto-derives discriminator / accounts / params from buildTransaction.
   */
  buildIntent: () => Promise<IntentInput> | IntentInput
  /**
   * Build the Solana transaction containing your guarded instruction(s).
   *
   * The SDK will prepend the secp256r1 and record_proof instructions automatically.
   * Do NOT include them here. Use the fresh recentBlockhash provided.
   */
  buildTransaction: (args: {
    /** Fresh blockhash fetched after passkey approval — use this, not a cached one */
    recentBlockhash: string
  }) => Promise<Transaction | VersionedTransaction>
  /** Override the connection for this call */
  connection?: Connection
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useTrana — primary integration point for protected transactions.
 *
 * ```tsx
 * const { authorizeAndSend } = useTrana()
 *
 * await authorizeAndSend({
 *   buildIntent: () => ({
 *     targetProgramId: MY_PROGRAM_ID,
 *     instructionDiscriminator: WITHDRAW_DISCRIMINATOR,
 *     accounts: [vaultPda, recipient],
 *     params: amountBuffer,
 *   }),
 *   // buildTransaction gets only { recentBlockhash } — no proof plumbing needed.
 *   // The SDK prepends secp256r1 + record_proof automatically.
 *   buildTransaction: async ({ recentBlockhash }) => {
 *     const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey })
 *     tx.add(buildWithdrawIx(...))
 *     return tx
 *   },
 * })
 * ```
 *
 * Flow:
 *   Detect → Register (if needed) → Approve → Build tx → Sign once → Send
 *
 * Mental model:
 *   - Passkey approves the action intent
 *   - Wallet signs the final Solana transaction
 *   These are different roles. Both are required.
 */
export function useTrana() {
  const ctx = useTranaContext()
  const { connection: walletConn }               = useConnection()
  const { publicKey, sendTransaction: walletSend, signTransaction } = useWallet()

  const authorizeAndSend = useCallback(async (
    args: AuthorizeAndSendArgs
  ): Promise<string> => {
    if (!publicKey) throw new Error("Wallet not connected")
    const conn = args.connection ?? walletConn ?? ctx.connection

    // ── 1. Ensure registry exists (lazy registration) ─────────────────────────
    let registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
    if (!registry) {
      await ctx._triggerRegistration()
      registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
      if (!registry) throw new Error("Trana: registry not found after registration")
    }

    // ── 2. Build intent ────────────────────────────────────────────────────────
    const intentInput = await args.buildIntent()

    const intent = buildIntent(
      publicKey,
      ctx.config.guardProgramId,
      intentInput,
      registry.nonce,
      {
        policy:       ctx.config.policy,
        cluster:      ctx.config.cluster,
        expiryTtlSec: ctx.config.expiryTtlSec,
      }
    )

    // ── 3. Passkey approval over exact intent hash ────────────────────────────
    const approval = await ctx._triggerApproval(intent)

    // ── 4. Build secp256r1 precompile instruction ─────────────────────────────
    const webAuthnMsg = buildWebAuthnMessage(approval.authenticatorData, approval.clientDataJSON)
    const secp256r1Ix = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)

    // ── 5. Build guard::record_proof data-carrier instruction ─────────────────
    // Carries all WebAuthn data. The guard reads this from the Instructions sysvar
    // so no proof data needs to pass through the protected instruction's params.
    const recordProofIx = buildRecordProofIx(
      ctx.config.guardProgramId,
      approval.authenticatorData,
      approval.clientDataJSON,
      intent.expiryUnix,
      intent.cluster,
      intent.policyId,
    )

    // ── 6. Fetch fresh blockhash AFTER approval ────────────────────────────────
    const { blockhash: recentBlockhash } = await conn.getLatestBlockhash("confirmed")

    // ── 7. Developer builds their transaction (no proof params needed) ────────
    const tx = await args.buildTransaction({ recentBlockhash })

    // ── 8. Prepend secp256r1 + record_proof before the protected instruction ──
    // Final layout:
    //   ix[N-2]: secp256r1 precompile
    //   ix[N-1]: guard::record_proof
    //   ix[N]:   developer's protected instruction(s)
    if (tx instanceof Transaction) {
      tx.instructions.unshift(recordProofIx)
      tx.instructions.unshift(secp256r1Ix)

      if (signTransaction) {
        const signed = await signTransaction(tx)
        return conn.sendRawTransaction(signed.serialize(), { skipPreflight: false })
      }
    }

    // VersionedTransaction path — wallet signs and sends directly
    return walletSend(tx, conn)
  }, [publicKey, walletSend, signTransaction, walletConn, ctx])

  return { authorizeAndSend }
}
