import type { GuardContext, GuardRequirement } from "./types"
import { getPasskeyStatus } from "./client"
import { evaluatePolicy, buildDefaultPolicy } from "./policy"

const SOL = 1_000_000_000 // lamports per SOL

/**
 * Evaluate whether 2FA is required for the given context.
 *
 * This is a client-side check used for UX only — it determines whether to show
 * the passkey prompt before building the transaction.
 *
 * The Anchor program enforces the same rule independently. Both must agree.
 */
export async function checkRequirement(
  ctx: GuardContext,
  thresholdSol = 20
): Promise<GuardRequirement> {
  const status = await getPasskeyStatus(ctx.wallet, ctx.serverUrl)

  const policy = buildDefaultPolicy(thresholdSol * SOL)

  const required = evaluatePolicy(policy, {
    amount: ctx.amount,
    optIn: status.opt_in && status.has_passkey,
  })

  if (!required) return { required: false }

  if (ctx.amount >= thresholdSol * SOL) {
    return { required: true, reason: "threshold" }
  }
  return { required: true, reason: "opt_in" }
}
