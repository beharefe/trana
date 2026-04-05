/**
 * Policy rule tree — client-side evaluation.
 *
 * The same logic is mirrored in the Anchor program. Both must agree on
 * whether 2FA is required for a given context.
 *
 * Model:
 *   Policy = Rule | { op: "Any", rules: Policy[] } | { op: "All", rules: Policy[] }
 *
 * Primitive rules (MVP):
 *   HighValueTransfer { threshold }  — amount >= threshold (lamports)
 *   UserOptIn                        — user opted in to always-2FA
 *   AdminAction                      — placeholder for admin-gated instructions
 *   Always                           — unconditional
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrimitiveRule =
  | { type: "HighValueTransfer"; threshold: number }
  | { type: "UserOptIn" }
  | { type: "AdminAction" }
  | { type: "Always" }

export type Policy =
  | PrimitiveRule
  | { op: "Any"; rules: Policy[] }
  | { op: "All"; rules: Policy[] }

export interface PolicyContext {
  /** Transfer amount in lamports. */
  amount: number
  /** Whether the user opted into 2FA (from /api/status, UX signal only). */
  optIn: boolean
  /** Whether this is an admin action. */
  isAdminAction?: boolean
}

// ── Built-in standard policy ──────────────────────────────────────────────────
// This mirrors what the Config PDA enforces onchain.
// Any([HighValueTransfer { threshold }, UserOptIn])

export function buildDefaultPolicy(thresholdLamports: number): Policy {
  return {
    op: "Any",
    rules: [
      { type: "HighValueTransfer", threshold: thresholdLamports },
      { type: "UserOptIn" },
    ],
  }
}

// ── Evaluation ────────────────────────────────────────────────────────────────

export function evaluatePolicy(policy: Policy, ctx: PolicyContext): boolean {
  if ("op" in policy) {
    if (policy.op === "Any") {
      return policy.rules.some((rule) => evaluatePolicy(rule, ctx))
    }
    if (policy.op === "All") {
      return policy.rules.every((rule) => evaluatePolicy(rule, ctx))
    }
  }

  // Primitive rule
  const rule = policy as PrimitiveRule
  switch (rule.type) {
    case "HighValueTransfer":
      return ctx.amount >= rule.threshold
    case "UserOptIn":
      return ctx.optIn
    case "AdminAction":
      return ctx.isAdminAction === true
    case "Always":
      return true
    default:
      return false
  }
}
