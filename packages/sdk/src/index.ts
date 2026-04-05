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
