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
 *   needs-registration → modal: "Register passkey"
 *   registering        → modal: spinner while onchain tx confirms
 *   needs-approval     → modal: "Approve with passkey"
 *   approving          → modal: spinner while WebAuthn runs
 *   error              → modal: error message
 *
 * Send flow (try/retry) lives in useTrana — not tracked here.
 */
export type TranaState =
  | { phase: "idle" }
  | { phase: "needs-registration" }
  | { phase: "registering" }
  | { phase: "needs-approval"; intent: TranaIntent }
  | { phase: "approving";      intent: TranaIntent }
  | { phase: "error"; message: string }

export type TranaAction =
  | { type: "TRIGGER_REGISTRATION" }
  | { type: "START_REGISTER" }
  | { type: "TRIGGER_APPROVAL"; intent: TranaIntent }
  | { type: "START_APPROVE" }
  | { type: "RESOLVE" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" }

export function tranaReducer(state: TranaState, action: TranaAction): TranaState {
  switch (action.type) {
    case "TRIGGER_REGISTRATION": return { phase: "needs-registration" }
    case "START_REGISTER":       return { phase: "registering" }
    case "TRIGGER_APPROVAL":     return { phase: "needs-approval", intent: action.intent }
    case "START_APPROVE":
      return state.phase === "needs-approval"
        ? { phase: "approving", intent: state.intent }
        : state
    case "RESOLVE":              return { phase: "idle" }
    case "ERROR":                return { phase: "error", message: action.message }
    case "RESET":                return { phase: "idle" }
    default:                     return state
  }
}
