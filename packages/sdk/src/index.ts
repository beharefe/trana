// Types
export type {
  ProofPayload,
  PasskeyProof,
  GuardRequirement,
  GuardContext,
  StatusResponse,
} from "./types"

// Policy
export {
  evaluatePolicy,
  buildDefaultPolicy,
  type Policy,
  type PrimitiveRule,
  type PolicyContext,
} from "./policy"

// Requirement check
export { checkRequirement } from "./requirement"

// Passkey / WebAuthn (browser-only)
export { startPasskeyRegistration, getPasskeyProof, canonicalJson } from "./passkey"

// Transaction proof attachment
export { attachProof } from "./proof"

// Utilities
export { sha256, generateNonce } from "./utils"

// HTTP client
export {
  getPasskeyStatus,
  fetchRegistrationOptions,
  verifyRegistration,
  fetchApprovalOptions,
  verifyApproval,
} from "./client"
