import { PublicKey } from "@solana/web3.js"
import type { TranaIntent } from "./intent"

// ── Config ────────────────────────────────────────────────────────────────────

export type TranaConfig = {
  /** The deployed Trana guard program ID. */
  guardProgramId: PublicKey
  /**
   * Policy label passed to the onchain enforce() call.
   * Must match what the calling program expects.
   * e.g. "AdminAction" | "HighValueTransfer" | "VaultWithdraw" | "Always"
   */
  policy: string
  /**
   * Solana cluster — included in the intent hash for domain separation.
   * Prevents a devnet proof being replayed on mainnet.
   * Defaults to "mainnet-beta".
   */
  cluster?: string
  /** Approval expiry window in seconds. Defaults to 120. */
  expiryTtlSec?: number
  /** WebAuthn relying party ID. Defaults to window.location.hostname. */
  rpId?: string
}

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * UI phases driven by TranaProvider.
 *
 * Phases that affect visible UI:
 *   needs-registration  → modal: "Register passkey"
 *   registering         → modal: spinner while onchain tx confirms
 *   needs-confirmation  → modal: decoded preview before passkey
 *   confirming          → modal: transitioning to passkey prompt
 *   needs-approval      → modal: "Approve with passkey"
 *   approving           → modal: spinner while WebAuthn runs
 *   error               → modal: error message
 *
 * Send flow (try/retry) lives in useTrana — not tracked here.
 */
export type IntentPreview = {
  label?:     string
  amountSol?: string
  policy:     string
}

export type TranaState =
  | { phase: "idle" }
  | { phase: "needs-registration"; intentPreview?: IntentPreview }
  | { phase: "registering" }
  | { phase: "needs-confirmation"; intent: TranaIntent; label?: string }
  | { phase: "confirming";         intent: TranaIntent; label?: string }
  | { phase: "needs-approval"; intent: TranaIntent }
  | { phase: "approving";      intent: TranaIntent }
  | { phase: "error"; message: string; recoverable: boolean }

export type TranaAction =
  | { type: "TRIGGER_REGISTRATION"; intentPreview?: IntentPreview }
  | { type: "START_REGISTER" }
  | { type: "TRIGGER_CONFIRMATION"; intent: TranaIntent; label?: string }
  | { type: "START_CONFIRM" }
  | { type: "TRIGGER_APPROVAL"; intent: TranaIntent }
  | { type: "START_APPROVE" }
  | { type: "RESOLVE" }
  | { type: "ERROR"; message: string; recoverable?: boolean }
  | { type: "RESET" }

export function tranaReducer(state: TranaState, action: TranaAction): TranaState {
  switch (action.type) {
    case "TRIGGER_REGISTRATION":  return { phase: "needs-registration", intentPreview: action.intentPreview }
    case "START_REGISTER":        return { phase: "registering" }
    case "TRIGGER_CONFIRMATION":  return { phase: "needs-confirmation", intent: action.intent, label: action.label }
    case "START_CONFIRM":
      return state.phase === "needs-confirmation"
        ? { phase: "confirming", intent: state.intent, label: state.label }
        : state
    case "TRIGGER_APPROVAL":     return { phase: "needs-approval", intent: action.intent }
    case "START_APPROVE":
      return state.phase === "needs-approval"
        ? { phase: "approving", intent: state.intent }
        : state
    case "RESOLVE":              return { phase: "idle" }
    case "ERROR":                return { phase: "error", message: action.message, recoverable: action.recoverable ?? true }
    case "RESET":                return { phase: "idle" }
    default:                     return state
  }
}
