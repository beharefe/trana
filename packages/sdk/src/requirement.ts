import type { Policy } from "./policy"
import { evaluatePolicy } from "./policy"

export interface RequirementContext {
  amount?: bigint
  currentSlot?: bigint
}

export interface GuardRequirement {
  required: boolean
  policy?: Policy
}

export function checkRequirement(
  policy: Policy,
  ctx: RequirementContext
): GuardRequirement {
  const required = evaluatePolicy(policy, ctx)
  return { required, policy: required ? policy : undefined }
}
