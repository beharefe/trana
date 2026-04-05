/**
 * Canonical payload that the bridge signs and the Anchor program verifies.
 *
 * IMPORTANT: keys must be serialised in this exact order for sha256 to match
 * both client-side and onchain.
 */
export interface ProofPayload {
  programId: string   // base58 program id
  instruction: string // always "transfer" for MVP
  amount: number      // lamports
  nonce: string       // 32-byte random value, hex-encoded
  expiry: number      // unix timestamp (seconds)
}

/** Ed25519 proof returned by the bridge after WebAuthn verification. */
export interface PasskeyProof {
  /** 64-byte Ed25519 signature by the bridge server key. */
  signature: Uint8Array
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
  /** Wallet public key (base58). */
  wallet: string
  /** Transfer amount in lamports. */
  amount: number
  /** Base URL of the Next.js app (e.g. http://localhost:3000). */
  serverUrl: string
}

/** Response from GET /api/status. */
export interface StatusResponse {
  /** Whether the wallet has a passkey registered offchain. UX signal only. */
  has_passkey: boolean
  /** Whether the user has opted into 2FA regardless of threshold. */
  opt_in: boolean
}
