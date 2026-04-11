"use client"

import { useCallback } from "react"
import {
  Connection,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { buildSecp256r1Ix, buildWebAuthnMessage } from "../secp256r1"
import { fetchRegistry } from "./registry"
import { buildIntent, hashIntent, TranaIntent, IntentInput } from "./intent"
import { useTranaContext } from "./provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type { IntentInput }

/**
 * Arguments passed to useTrana().authorizeAndSend().
 *
 * The developer provides two factory functions. The SDK:
 *   1. Fetches the registry (triggers registration if needed)
 *   2. Calls buildIntent() to get the intent input
 *   3. Builds a frozen TranaIntent and hashes it into a WebAuthn challenge
 *   4. Triggers the passkey approval modal
 *   5. Fetches a fresh blockhash
 *   6. Calls buildTransaction() with the ready proof instruction
 *   7. Wallet signs the resulting transaction ONCE
 *   8. Sends
 *
 * This ensures:
 *   - Passkey approves the exact action before any Solana tx is built
 *   - Wallet signs only once
 *   - Blockhash is fresh at signing time (fetched after approval)
 *   - No post-sign transaction mutation
 */
export type AuthorizeAndSendArgs = {
  /**
   * Return the action description to authorize.
   * Called after the registry is confirmed to exist.
   */
  buildIntent: () => Promise<IntentInput> | IntentInput
  /**
   * Build the final Solana transaction using the provided proof instruction.
   *
   * The proof instruction must be included in the transaction — place it
   * according to your program's requirements (typically before the guarded ix).
   *
   * Receive a fresh recentBlockhash — do NOT use a stale one you fetched earlier.
   */
  buildTransaction: (args: {
    /** secp256r1 verify instruction — place at index 0 in your transaction */
    proofIx: TransactionInstruction
    /** Fresh blockhash fetched after approval — use this, not a cached one */
    recentBlockhash: string
    /** The frozen intent that was approved */
    intent: TranaIntent
    /**
     * Raw WebAuthn authenticatorData bytes — pass to enforce() CPI as-is.
     * Only needed when your onchain program calls guard::cpi::enforce().
     * Typically 37 bytes: rpIdHash(32) + flags(1) + counter(4).
     */
    authenticatorData: Uint8Array
    /**
     * Raw WebAuthn clientDataJSON bytes — pass to enforce() CPI as-is.
     * Only needed when your onchain program calls guard::cpi::enforce().
     */
    clientDataJSON: Uint8Array
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
 *   buildTransaction: async ({ proofIx, recentBlockhash }) => {
 *     const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey })
 *     tx.add(proofIx)
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
      // No registry PDA — trigger registration modal, then re-fetch
      await ctx._triggerRegistration()
      registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
      if (!registry) throw new Error("Trana: registry not found after registration")
    }

    // ── 2. Build the intent (developer describes the action) ──────────────────
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
    // The challenge = hashIntent(intent) — cryptographically binds the
    // passkey signature to the exact action (program, accounts, params, nonce).
    // The intent is frozen before credentials.get() is called.
    const approval = await ctx._triggerApproval(intent)

    // ── 4. Build secp256r1 verify instruction ─────────────────────────────────
    const payloadHash = hashIntent(intent)
    const webAuthnMsg = buildWebAuthnMessage(approval.authenticatorData, approval.clientDataJSON)
    const proofIx     = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)

    // ── 5. Fetch fresh blockhash AFTER approval ────────────────────────────────
    // Do NOT use a blockhash fetched before the approval ceremony.
    // Fetching here ensures it is fresh when the wallet signs.
    const { blockhash: recentBlockhash } = await conn.getLatestBlockhash("confirmed")

    // ── 6. Developer builds the final transaction ─────────────────────────────
    // The developer receives proofIx and includes it in their transaction.
    // They also receive a fresh recentBlockhash.
    const tx = await args.buildTransaction({
      proofIx,
      recentBlockhash,
      intent,
      authenticatorData: approval.authenticatorData,
      clientDataJSON:    approval.clientDataJSON,
    })

    // ── 7. Wallet signs ONCE and sends ────────────────────────────────────────
    // This is the only wallet signature in the flow.
    // There is no prior wallet signature to mutate or rebuild.
    if (tx instanceof Transaction && signTransaction) {
      const signed = await signTransaction(tx)
      return conn.sendRawTransaction(signed.serialize(), { skipPreflight: false })
    }

    return walletSend(tx, conn)
  }, [publicKey, walletSend, signTransaction, walletConn, ctx])

  return { authorizeAndSend }
}
