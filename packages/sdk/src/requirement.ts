import type { GuardContext, GuardRequirement } from "./types"
import { getPasskeyStatus } from "./client"
import { evaluatePolicy, buildDefaultPolicy } from "./policy"

const SOL = 1_000_000_000

/**
 * Client-side policy evaluation.
 *
 * Determines whether 2FA is required for UX purposes — decides whether to
 * show the passkey prompt before building the transaction.
 *
 * This is NOT a security boundary. The Anchor program enforces the same
 * policy independently. If these disagree, the transaction fails onchain.
 *
 * "Deterministic client-side policy evaluation" — same rule tree, same result.
 */
export async function checkRequirement(
  ctx: GuardContext,
  thresholdSol = 20
): Promise<GuardRequirement> {
  let optIn = ctx.optIn ?? false
  if (ctx.optIn === undefined) {
    const status = await getPasskeyStatus(ctx.wallet, ctx.serverUrl)
    optIn = status.opt_in && status.has_passkey
  }

  const policy = buildDefaultPolicy(thresholdSol * SOL)
  const required = evaluatePolicy(policy, {
    amount: ctx.amount,
    optIn,
  })

  if (!required) return { required: false }

  if (ctx.amount >= thresholdSol * SOL) {
    return { required: true, reason: "threshold" }
  }
  return { required: true, reason: "opt_in" }
}
