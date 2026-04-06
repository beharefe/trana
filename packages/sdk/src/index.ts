/**
 * @trana-guard/sdk
 *
 * Client library for Trana — onchain execution-time authorization for Solana.
 *
 * Trust model:
 *   The onchain registry PDA is the only trust anchor.
 *   No trusted backend. No trusted bridge. No server key.
 *
 * Quick start (secp256r1 / passkey path — no bridge):
 *   1. Register passkey: call register_two_fa onchain via startOnchainRegistration()
 *   2. Protect a tx:     prepareTransaction({ ..., approve: redirectApprove(...) })
 *   3. Inject proof:     attachProofToTransaction(tx, proof)
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  TranaPolicy,
  TranaPayload,
  Secp256r1Proof,
  Ed25519BridgeProof,
  PasskeyProof,
  PrepareTransactionArgs,
  GuardRequirement,
  GuardContext,
  StatusResponse,
  VaultStatusResponse,
  // Legacy
  ProofPayload,
  VaultProofPayload,
} from "./types"

export { isSecp256r1Proof } from "./types"

// ── secp256r1 helpers ─────────────────────────────────────────────────────────
export {
  buildSecp256r1Ix,
  buildWebAuthnMessage,
  computePayloadHash,
  SECP256R1_PROGRAM_ID,
} from "./secp256r1"

// ── High-level transaction API ────────────────────────────────────────────────
export {
  prepareTransaction,
  attachProofToTransaction,
  buildRegisterRedirectUrl,
  buildApprovalRedirectUrl,
  buildApproveRedirectUrl,       // @deprecated
  parseApproveRedirectResult,
} from "./transaction"

// ── Policy evaluation (client-side, mirrors the Rust program) ────────────────
export {
  evaluatePolicy,
  buildDefaultPolicy,
  type Policy,
  type PrimitiveRule,
  type PolicyContext,
} from "./policy"

// ── Requirement check ─────────────────────────────────────────────────────────
export { checkRequirement } from "./requirement"

// ── WebAuthn / passkey (browser-only) ────────────────────────────────────────
export {
  startPasskeyRegistration,
  getPasskeyProof,
  getVaultProof,
  canonicalJson,
  canonicalVaultJson,
} from "./passkey"

// ── HTTP client helpers ───────────────────────────────────────────────────────
export {
  getPasskeyStatus,
  getVaultStatus,
  fetchRegistrationOptions,
  verifyRegistration,
  fetchApprovalOptions,
  verifyApproval,
} from "./client"

// ── Utilities ─────────────────────────────────────────────────────────────────
export { sha256, generateNonce } from "./utils"

// ── Legacy proof attachment (Ed25519 bridge path) ────────────────────────────
export { attachProof } from "./proof"
