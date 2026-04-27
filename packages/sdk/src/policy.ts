// Canonical Trana policies — mirrors the onchain Policy enum.

export type Policy =
  | { type: "Require" }
  | { type: "Limit"; paramOffset: number; limit: bigint }
  | { type: "NotBefore"; slot: bigint }
  | { type: "NotAfter"; slot: bigint }

export function policyString(policy: Policy): string {
  switch (policy.type) {
    case "Require":   return "trana.require"
    case "Limit":     return "trana.limit"
    case "NotBefore": return "trana.not_before"
    case "NotAfter":  return "trana.not_after"
  }
}

// Client-side evaluation: would this policy fire given current context?
// UX only — the onchain program is the authority.
export function evaluatePolicy(
  policy: Policy,
  ctx: { amount?: bigint; currentSlot?: bigint }
): boolean {
  switch (policy.type) {
    case "Require":   return true
    case "Limit":     return ctx.amount !== undefined && ctx.amount >= policy.limit
    case "NotBefore": return ctx.currentSlot !== undefined && ctx.currentSlot < policy.slot
    case "NotAfter":  return ctx.currentSlot !== undefined && ctx.currentSlot > policy.slot
  }
}
