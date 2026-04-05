/**
 * Canonical payload that the bridge signs and the Anchor program verifies.
 *
 * IMPORTANT: keys must be serialised in this exact order for sha256 to match
 * both client-side and onchain.
 */

/** Payload for `protected_transfer` (direct SOL, random nonce). */
export interface ProofPayload {
  programId:   string  // base58 program id
  instruction: "transfer"
  amount:      number  // lamports
  nonce:       string  // 32-byte random value, hex-encoded
  expiry:      number  // unix timestamp (seconds)
}

/** Payload for `vault_withdraw` (vault PDA, monotonic nonce). */
export interface VaultProofPayload {
  programId:   string  // base58 program id
  instruction: "vault_withdraw"
  vault:       string  // base58 vault PDA address
  amount:      number  // lamports
  nonce:       number  // vault.next_nonce (monotonic u64)
  expiry:      number  // unix timestamp (seconds)
}

/** Ed25519 proof returned by the bridge after WebAuthn verification. */
export interface PasskeyProof {
  /** 64-byte Ed25519 signature by the bridge server key. */
  signature:   Uint8Array
  /** 32-byte bridge server Ed25519 public key. */
  serverPubkey: Uint8Array
  /** 32-byte SHA-256 hash of the canonical ProofPayload JSON. */
  payloadHash: Uint8Array
}

/** Result of client-side policy evaluation. */
export interface GuardRequirement {
  required: boolean
  reason?: "threshold" | "opt_in"
}

/** Context passed to checkRequirement(). */
export interface GuardContext {
  wallet:    string  // Wallet public key (base58)
  amount:    number  // Transfer amount in lamports
  serverUrl: string  // Base URL of the Next.js app
  optIn?:    boolean // Override opt_in status (optional)
}

/** Response from GET /api/status. */
export interface StatusResponse {
  /** UX signal: whether a passkey is registered offchain for this wallet. */
  has_passkey: boolean
  /** Whether the user opted into always-2FA. */
  opt_in:      boolean
}

/** Response from GET /api/vault?wallet= */
export interface VaultStatusResponse {
  initialized:  boolean
  balance_sol:  number   // SOL (not lamports)
  next_nonce:   number
  opt_in:       boolean
}
