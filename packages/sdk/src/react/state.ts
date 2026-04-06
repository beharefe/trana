import { PublicKey } from "@solana/web3.js"
import type { TranaIntent } from "./intent"

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Configuration passed to `<TranaProvider>`.
 */
export type TranaConfig = {
  /** The deployed Trana guard program ID. */
  guardProgramId: PublicKey
  /**
   * Policy label passed to the onchain enforce() call.
   * Must match what the calling program expects.
   * e.g. "AdminAction" | "HighValueTransfer" | "VaultWithdraw" | "Always"
   */
  policy: string
  /** Approval expiry window in seconds. Defaults to 120. */
  expiryTtlSec?: number
  /** WebAuthn relying party ID. Defaults to window.location.hostname. */
  rpId?: string
}

// ── State machine ─────────────────────────────────────────────────────────────

export type TranaState =
  | { phase: "idle" }
  | { phase: "simulating" }
  | { phase: "needs-registration" }
  | { phase: "registering" }
  | { phase: "needs-approval"; intent: TranaIntent }
  | { phase: "approving";      intent: TranaIntent }
  | { phase: "sending" }
  | { phase: "error"; message: string }

export type TranaAction =
  | { type: "SIMULATE" }
  | { type: "NEEDS_REGISTRATION" }
  | { type: "START_REGISTER" }
  | { type: "NEEDS_APPROVAL"; intent: TranaIntent }
  | { type: "START_APPROVE" }
  | { type: "SEND" }
  | { type: "DONE" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" }

export function tranaReducer(state: TranaState, action: TranaAction): TranaState {
  switch (action.type) {
    case "SIMULATE":          return { phase: "simulating" }
    case "NEEDS_REGISTRATION": return { phase: "needs-registration" }
    case "START_REGISTER":    return { phase: "registering" }
    case "NEEDS_APPROVAL":    return { phase: "needs-approval", intent: action.intent }
    case "START_APPROVE":     return state.phase === "needs-approval"
                                ? { phase: "approving", intent: state.intent }
                                : state
    case "SEND":              return { phase: "sending" }
    case "DONE":              return { phase: "idle" }
    case "ERROR":             return { phase: "error", message: action.message }
    case "RESET":             return { phase: "idle" }
    default:                  return state
  }
}
