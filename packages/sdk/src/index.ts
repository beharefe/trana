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
export { sha256, sha256Bytes, generateNonce } from "./utils"

// secp256r1 precompile (browser + Node)
export { SECP256R1_PROGRAM_ID, buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx } from "./secp256r1"

// Browser WebAuthn utilities (no backend required)
export { doRegistration, doApproval, derToCompact, lowS, extractPubkeyFromAttestation } from "./react/webauthn"


// HTTP client (legacy backend bridge — not required for secp256r1 passkey flow)
export {
  getPasskeyStatus,
  getVaultStatus,
  fetchRegistrationOptions,
  verifyRegistration,
  fetchApprovalOptions,
  verifyApproval,
} from "./client"

// ── React provider + hook (browser only) ─────────────────────────────────────
//
// Correct integration flow:
//   1. Wrap app:  <TranaProvider config={...}><App /><TranaModal /></TranaProvider>
//   2. Call:      const { authorizeAndSend } = useTrana()
//   3. Use:       await authorizeAndSend({ buildIntent, buildTransaction })
//
// Flow: Detect → Register (if needed) → Approve (device) → Build tx → Sign once → Send
// Passkey approves the action intent. Wallet signs the final transaction. Both required.
export { TranaProvider, useTranaContext } from "./react/provider"
export type { TranaContextValue } from "./react/provider"
export { useTrana } from "./react/useTrana"
export type { AuthorizeAndSendArgs, IntentInput } from "./react/useTrana"
export { TranaModal } from "./react/modal"
export type { TranaConfig, TranaState, TranaAction } from "./react/state"
export type { TranaIntent } from "./react/intent"
export { buildIntent, hashIntent, intentToPayloadHash } from "./react/intent"
export { findRegistryPda, fetchRegistry } from "./react/registry"
export type { RegistryState } from "./react/registry"
// Error-based detection utilities (for custom flows that catch failed tx errors)
export { isTranaError, parseTranaError } from "./react/error"
export type { TranaErrorKind } from "./react/error"
// Simulation-based pre-detection (optional — authorizeAndSend does not require it)
export { detectEnforcement, hasSecp256r1Ix } from "./react/detector"
export type { DetectionResult } from "./react/detector"
// Passkey management hook (Phase 1: v1 registry stub; Phase 2: full multi-key impl)
export { useTranaPasskeys } from "./react/useTranaPasskeys"
export type { PasskeyEntry, RecoveryState, UseTranaPasskeysResult } from "./react/useTranaPasskeys"
// Backup nudge hook — surfaces one-time prompt to add a second passkey after first approval
export { useBackupNudge } from "./react/useBackupNudge"
export type { BackupNudgeState } from "./react/useBackupNudge"
