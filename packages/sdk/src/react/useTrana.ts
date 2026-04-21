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
import { detectEnforcement } from "./detector"
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
 *   1. Simulate without signature — detect which policy fires
 *   2. Registry fetch / lazy registration
 *   3. Intent construction — policy string taken from simulation logs
 *   4. Passkey approval modal
 *   5. secp256r1 precompile instruction
 *   6. trana::record_proof instruction (data carrier)
 *   7. Fresh blockhash fetch — AFTER passkey approval, not before
 *   8. Proof instruction insertion before the protected instruction
 *   9. Single wallet signature + send
 *
 * The blockhash is fetched after passkey approval so there is zero risk of
 * the blockhash expiring while the user is interacting with the passkey prompt.
 * The passkey signs the intent hash (bound to accounts + params + nonce),
 * not the transaction envelope, so the two are independent.
 */
export type AuthorizeAndSendArgs = {
  /**
   * Describe the action being authorized.
   * Called after simulation — intent will use the policy detected from logs.
   */
  buildIntent: () => Promise<IntentInput> | IntentInput
  /**
   * Build the Solana transaction containing your guarded instruction(s).
   * Use the fresh recentBlockhash provided — it is fetched AFTER passkey approval.
   * Do NOT include secp256r1 or record_proof instructions here.
   */
  buildTransaction: (args: { recentBlockhash: string }) => Promise<Transaction | VersionedTransaction>
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
 *   buildTransaction: async ({ recentBlockhash }) => {
 *     const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey })
 *     tx.add(buildWithdrawIx(...))
 *     return tx
 *   },
 * })
 * ```
 *
 * Flow:
 *   Simulate → Detect policy → Register (if needed) → Approve
 *   → Fresh blockhash → Build tx → Sign → Send
 */
export function useTrana() {
  const ctx = useTranaContext()
  const { connection: walletConn }                              = useConnection()
  const { publicKey, sendTransaction: walletSend, signTransaction } = useWallet()

  const authorizeAndSend = useCallback(async (
    args: AuthorizeAndSendArgs
  ): Promise<string> => {
    if (!publicKey) throw new Error("Wallet not connected")
    const conn = args.connection ?? walletConn ?? ctx.connection

    // ── 1. Build a probe transaction to simulate (no blockhash needed) ─────────
    // Use a dummy blockhash — simulation replaces it. We only need the instruction
    // structure to be correct so the guard can evaluate which policy fires.
    const { blockhash: probeBlockhash } = await conn.getLatestBlockhash("processed")
    const probeTx = await args.buildTransaction({ recentBlockhash: probeBlockhash })

    // ── 2. Simulate without wallet signature — detect which policy fires ────────
    // sigVerify: false   — no wallet signature needed
    // replaceRecentBlockhash: true — blockhash validity not checked
    const detection = await detectEnforcement(
      probeTx,
      conn,
      publicKey,
      ctx.config.guardProgramId,
      ctx.config.policy,
    )

    // If no enforcement needed (e.g. small withdrawal below threshold), send directly.
    if (!detection.needed) {
      const { blockhash } = await conn.getLatestBlockhash("confirmed")
      const tx = await args.buildTransaction({ recentBlockhash: blockhash })
      return walletSend(tx, conn)
    }

    // ── 3. Ensure registry exists (lazy registration) ─────────────────────────
    let registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
    if (!registry || detection.reason === "no-registry") {
      await ctx._triggerRegistration()
      registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
      if (!registry) throw new Error("Trana: registry not found after registration")
    }

    // ── 4. Build intent — policy comes from simulation logs, not config ────────
    // The guard reads the policy string from the proof and validates it matches
    // the hardcoded policy inside the enforce() instruction. Using the detected
    // policy guarantees the intent hash matches what the guard expects.
    const intentInput = await args.buildIntent()
    const intent = buildIntent(
      publicKey,
      ctx.config.guardProgramId,
      { ...intentInput, policy: detection.policy },
      registry.nonce,
      {
        policy:       detection.policy,
        cluster:      ctx.config.cluster,
        expiryTtlSec: ctx.config.expiryTtlSec,
      }
    )

    // ── 5. Passkey approval over exact intent hash ─────────────────────────────
    // User interacts with Touch ID / Face ID / YubiKey here.
    // This can take 0–30 seconds. The blockhash has NOT been fetched yet —
    // there is no expiry pressure during the passkey prompt.
    const approval = await ctx._triggerApproval(intent)

    // ── 6. Build proof instructions ────────────────────────────────────────────
    const webAuthnMsg = buildWebAuthnMessage(approval.authenticatorData, approval.clientDataJSON)
    const secp256r1Ix = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)
    const recordProofIx = buildRecordProofIx(
      ctx.config.guardProgramId,
      approval.authenticatorData,
      approval.clientDataJSON,
      intent.expiryUnix,
      intent.cluster,
      intent.policyId,
    )

    // ── 7. Fetch FRESH blockhash — NOW, after passkey is done ─────────────────
    // Milliseconds before signing. No timeout risk regardless of how long the
    // passkey prompt took.
    const { blockhash: recentBlockhash } = await conn.getLatestBlockhash("confirmed")

    // ── 8. Developer builds their transaction with the fresh blockhash ─────────
    const tx = await args.buildTransaction({ recentBlockhash })

    // ── 9. Prepend proof instructions — final layout: ──────────────────────────
    //   ix[N-2]: secp256r1 precompile
    //   ix[N-1]: trana::record_proof
    //   ix[N]:   developer's protected instruction(s)
    if (tx instanceof Transaction) {
      tx.instructions.unshift(recordProofIx)
      tx.instructions.unshift(secp256r1Ix)

      if (signTransaction) {
        const signed = await signTransaction(tx)
        return conn.sendRawTransaction(signed.serialize(), { skipPreflight: false })
      }
    }

    return walletSend(tx, conn)
  }, [publicKey, walletSend, signTransaction, walletConn, ctx])

  return { authorizeAndSend }
}
