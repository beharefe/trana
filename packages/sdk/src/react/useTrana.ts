"use client"

import { useCallback } from "react"
import {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js"

// instanceof checks fail across pnpm workspace boundaries — duck-type instead.
function isLegacyTransaction(tx: Transaction | VersionedTransaction): tx is Transaction {
  return "instructions" in tx && Array.isArray((tx as Transaction).instructions)
}
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx } from "../secp256r1"
import { decodeParamsU64 } from "../utils"
import { fetchRegistry } from "./registry"
import { buildIntent, intentFromInstruction, IntentInput } from "./intent"
import { detectEnforcement } from "./detector"
import { useTranaContext } from "./provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type { IntentInput }

/**
 * Arguments passed to useTrana().authorizeAndSend().
 *
 * Minimal usage — the SDK derives the intent automatically from the last
 * instruction in your transaction (the guarded instruction must be last):
 *
 * ```tsx
 * await authorizeAndSend({
 *   label: "Withdraw 1.5 SOL",
 *   buildTransaction: async ({ recentBlockhash }) => {
 *     const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey })
 *     tx.add(withdrawIx)
 *     return tx
 *   },
 * })
 * ```
 *
 * Advanced — override auto-derived intent fields (rarely needed):
 * ```tsx
 * await authorizeAndSend({
 *   buildTransaction: ...,
 *   buildIntent: () => ({ targetProgramId, accounts, params }),
 * })
 * ```
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
   * Build the Solana transaction containing your guarded instruction(s).
   * The guarded instruction must be last — the SDK prepends secp256r1 and
   * record_proof before it and derives the intent from it automatically.
   * Use the fresh recentBlockhash provided — it is fetched AFTER passkey approval.
   */
  buildTransaction: (args: { recentBlockhash: string }) => Promise<Transaction | VersionedTransaction>
  /** Human-readable label shown in the confirmation modal. e.g. "Withdraw 1.5 SOL" */
  label?: string
  /**
   * Advanced: manually describe the action being authorized.
   * When omitted, the SDK derives intent from the last instruction in your transaction.
   */
  buildIntent?: () => Promise<IntentInput> | IntentInput
  /** Override the connection for this call */
  connection?: Connection
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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

    // Derive intent from the last instruction of the probe tx (the guarded ix).
    // buildIntent overrides this when provided (edge cases: synthetic ixs, ALT etc.)
    const resolveIntentInput = async (): Promise<IntentInput> => {
      if (args.buildIntent) return args.buildIntent()
      if (isLegacyTransaction(probeTx)) {
        const lastIx = probeTx.instructions.at(-1)
        if (!lastIx) throw new Error("Trana: transaction has no instructions")
        return intentFromInstruction(lastIx, args.label)
      }
      // VersionedTransaction: inspect compiled message accounts + last instruction
      const msg     = probeTx.message
      const ixMeta  = msg.compiledInstructions.at(-1)
      if (!ixMeta) throw new Error("Trana: transaction has no instructions")
      const keys    = ixMeta.accountKeyIndexes.map(i => msg.staticAccountKeys[i])
      const progKey = msg.staticAccountKeys[ixMeta.programIdIndex]
      return {
        targetProgramId:          progKey,
        instructionDiscriminator: ixMeta.data.length >= 8 ? ixMeta.data.slice(0, 8) : undefined,
        accounts:                 keys,
        params:                   ixMeta.data.length > 8  ? ixMeta.data.slice(8)    : undefined,
        label:                    args.label,
      }
    }

    // ── 2. Simulate without wallet signature — detect which policy fires ────────
    const detection = await detectEnforcement(
      probeTx,
      conn,
      publicKey,
      ctx.config.guardProgramId,
      ctx.config.policy,
    )

    // If no enforcement needed (e.g. small withdrawal below the configured limit), send directly.
    if (!detection.needed) {
      const { blockhash } = await conn.getLatestBlockhash("confirmed")
      const tx = await args.buildTransaction({ recentBlockhash: blockhash })
      return walletSend(tx, conn)
    }

    // ── 3. Ensure registry exists (lazy registration) ─────────────────────────
    let registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
    if (!registry || detection.reason === "no-registry") {
      const previewInput = await resolveIntentInput()
      const raw = previewInput.params ? decodeParamsU64(previewInput.params) : null
      const amountSol = raw !== null ? (Number(raw) / 1e9).toFixed(4) : undefined
      await ctx._triggerRegistration({ label: previewInput.label, amountSol, policy: detection.policy })
      registry = await fetchRegistry(conn, publicKey, ctx.config.guardProgramId)
      if (!registry) throw new Error("Trana: registry not found after registration")
    }

    // ── 4. Build intent — policy comes from simulation logs, not config ────────
    const intentInput = await resolveIntentInput()
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
    await ctx._triggerConfirmation(intent, intentInput.label)

    // ── 5. Passkey approval over exact intent hash ─────────────────────────────
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

      if (isLegacyTransaction(tx)) {
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
