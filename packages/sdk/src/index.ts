// Types
export type {
  ProofPayload,
  VaultProofPayload,
  PasskeyProof,
  GuardRequirement,
  GuardContext,
  StatusResponse,
  VaultStatusResponse,
} from "./types"

// Policy
export {
  evaluatePolicy,
  buildDefaultPolicy,
  type Policy,
  type PrimitiveRule,
  type PolicyContext,
} from "./policy"

// Requirement check (deterministic client-side policy evaluation)
export { checkRequirement } from "./requirement"

// Passkey / WebAuthn (browser-only)
export {
  startPasskeyRegistration,
  getPasskeyProof,
  getVaultProof,
  canonicalJson,
  canonicalVaultJson,
} from "./passkey"

// Transaction proof attachment
export { attachProof } from "./proof"

// Utilities
export { sha256, generateNonce } from "./utils"

// HTTP client
export {
  getPasskeyStatus,
  getVaultStatus,
  fetchRegistrationOptions,
  verifyRegistration,
  fetchApprovalOptions,
  verifyApproval,
} from "./client"

// ── React provider + hook (browser only) ─────────────────────────────────────
// Usage:
//   <TranaProvider config={...}><App /><TranaModal /></TranaProvider>
//   const { send } = useTrana()
//   await send(tx)
export { TranaProvider, useTranaContext } from "./react/provider"
export type { TranaContextValue } from "./react/provider"
export { useTrana } from "./react/useTrana"
export { TranaModal } from "./react/modal"
export type { TranaConfig, TranaState, TranaAction } from "./react/state"
export type { TranaIntent } from "./react/intent"
export { buildIntent, intentToPayloadHash } from "./react/intent"
export { findRegistryPda, fetchRegistry } from "./react/registry"
export type { RegistryState } from "./react/registry"
export { isTranaError, parseTranaError } from "./react/error"
export type { TranaErrorKind } from "./react/error"
export { detectEnforcement, hasSecp256r1Ix } from "./react/detector"
export type { DetectionResult } from "./react/detector"
