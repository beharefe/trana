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
 *   4. Confirmation modal — decoded preview before biometric
 *   5. Passkey approval modal — Touch ID / Face ID / YubiKey
 *   6. secp256r1 precompile instruction
 *   7. trana::record_proof instruction (data carrier)
 *   8. Fresh blockhash → build tx → wallet sign → send (retry on expiry)
 *
 * The passkey signs the intent hash (bound to accounts + params + nonce),
 * not the transaction envelope. Blockhash and passkey are independent —
 * if the wallet sign fails with an expired blockhash, a fresh one is fetched
 * and the wallet re-prompts without re-running the passkey.
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
 *   Simulate → Detect policy → Register (if needed) → Confirm preview
 *   → Passkey approve → Build proof → [retry loop] Blockhash → Build tx → Sign → Send
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
      // Build intent preview so the registration modal can show what the user is trying to do
      const previewInput = await args.buildIntent()
      const amountSol = previewInput.params && previewInput.params.length >= 8
        ? (Number(new DataView(previewInput.params.buffer, previewInput.params.byteOffset, 8).getBigUint64(0, true)) / 1e9).toFixed(4)
        : undefined
      await ctx._triggerRegistration({ label: previewInput.label, amountSol, policy: detection.policy })
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

    // ── 4b. Confirmation preview — user reads what they're authorizing ─────────
    // Shows decoded intent (label, policy, program) before biometric prompt.
    // Makes the passkey tap the meaningful "commit" gesture, not a blind confirm.
    await ctx._triggerConfirmation(intent, intentInput.label)

    // ── 5. Passkey approval over exact intent hash ─────────────────────────────
    // User interacts with Touch ID / Face ID / YubiKey here.
    // Blockhash has NOT been fetched — no expiry pressure during biometric.
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

    // ── 7–9. Fresh blockhash → build tx → wallet sign → send ──────────────────
    // Retry on blockhash expiry: the passkey proof binds to the intent hash, not
    // the transaction, so it remains valid across blockhash refreshes. Only the
    // wallet needs to re-sign — no second biometric prompt.
    const MAX_BLOCKHASH_RETRIES = 2
    for (let attempt = 0; attempt < MAX_BLOCKHASH_RETRIES; attempt++) {
      const { blockhash: recentBlockhash } = await conn.getLatestBlockhash("confirmed")
      const tx = await args.buildTransaction({ recentBlockhash })

      if (tx instanceof Transaction) {
        tx.instructions.unshift(recordProofIx)
        tx.instructions.unshift(secp256r1Ix)
        try {
          if (signTransaction) {
            const signed = await signTransaction(tx)
            return await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false })
          }
          return await walletSend(tx, conn)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const expired = msg.includes("Blockhash not found") || msg.includes("block height exceeded")
          if (expired && attempt < MAX_BLOCKHASH_RETRIES - 1) continue
          throw e
        }
      }

      return walletSend(tx, conn)
    }
    throw new Error("Transaction expired — please try again")
  }, [publicKey, walletSend, signTransaction, walletConn, ctx])

  return { authorizeAndSend }
}
