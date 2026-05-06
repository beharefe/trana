/**
 * Trana SDK — core types
 *
 * Trust model:
 *   The onchain registry PDA is the only trust anchor.
 *   No trusted backend. No trusted bridge. No server key.
 *   Authorization is enforced by the Solana program and precompiles.
 */

import type { Connection, PublicKey, Transaction } from "@solana/web3.js"

// ── Policy (mirrors the Rust Policy enum) ────────────────────────────────────

/**
 * Which policy rule triggered enforcement.
 * Matches the Rust `Policy` enum in the Trana Guard program.
 */
export type TranaPolicy =
  | { type: "AdminAction" }
  | { type: "HighValueTransfer"; amount: number }
  | { type: "VaultWithdraw" }
  | { type: "Always" }

// ── Payload ───────────────────────────────────────────────────────────────────

/**
 * Canonical payload that the passkey signs.
 * The program recomputes this hash onchain and verifies it matches the proof.
 *
 * Key order is fixed. Must match the calling program's `compute_payload_hash`.
 */
export interface TranaPayload {
  /** "trana.solana" — domain separator */
  domain:      "trana.solana"
  /** base58 authority / user wallet pubkey */
  userPubkey:  string
  /** base58 calling program ID */
  programId:   string
  /** policy type string */
  policy:      string
  /** monotonic nonce from the calling program's state */
  nonce:       number
  /** unix timestamp — proof is rejected after this */
  expiry:      number
}

// ── Proof ─────────────────────────────────────────────────────────────────────

/**
 * A secp256r1 (P-256) passkey proof ready to be attached to a transaction.
 *
 * The secp256r1 precompile instruction will be prepended at index 0.
 * Trana Guard verifies pubkey matches the registry PDA.
 */
export interface Secp256r1Proof {
  /** 64-byte compact P-256 signature (r ‖ s) */
  signature:   Uint8Array
  /** 33-byte compressed P-256 public key (SEC1) */
  publicKey:   Uint8Array
  /** 32-byte SHA-256 hash of the canonical payload JSON */
  payloadHash: Uint8Array
}

/**
 * An Ed25519 bridge proof (legacy path).
 * Used by the demo web app — the bridge verifies WebAuthn then signs with Ed25519.
 * @deprecated Use secp256r1 (registry path) for trustless onchain verification.
 */
export interface Ed25519BridgeProof {
  /** 64-byte Ed25519 signature from the bridge server key */
  signature:    Uint8Array
  /** 32-byte bridge server Ed25519 public key */
  serverPubkey: Uint8Array
  /** 32-byte SHA-256 payload hash */
  payloadHash:  Uint8Array
}

/** Union of supported proof types */
export type PasskeyProof = Secp256r1Proof | Ed25519BridgeProof

export function isSecp256r1Proof(p: PasskeyProof): p is Secp256r1Proof {
  return "publicKey" in p
}

// ── prepareTransaction args ───────────────────────────────────────────────────

export interface PrepareTransactionArgs {
  connection:    Connection
  walletPubkey:  PublicKey
  /** The transaction to protect */
  transaction:   Transaction
  /** Which policy to enforce */
  policy:        TranaPolicy
  /** The authority's Trana registry PDA */
  registryPda:   PublicKey
  /** A function that runs the passkey approval and returns the proof.
   *  Use `redirectApprove` (redirect flow) or `inlineApprove` (popup flow). */
  approve:       (payload: TranaPayload) => Promise<PasskeyProof>
}

// ── Legacy types (kept for backward compat) ───────────────────────────────────

/** @deprecated Use TranaPayload */
export interface ProofPayload {
  programId:   string
  instruction: "transfer"
  amount:      number
  nonce:       string
  expiry:      number
}

/** @deprecated Use TranaPayload */
export interface VaultProofPayload {
  programId:   string
  instruction: "vault_withdraw"
  vault:       string
  amount:      number
  nonce:       number
  expiry:      number
}

export interface GuardRequirement {
  required: boolean
  reason?:  "threshold" | "opt_in" | "admin" | "always"
}

export interface GuardContext {
  wallet:    string
  amount:    number
  serverUrl: string
  optIn?:    boolean
}

export interface StatusResponse {
  has_passkey: boolean
  opt_in:      boolean
}

export interface VaultStatusResponse {
  initialized:  boolean
  balance_sol:  number
  next_nonce:   number
  opt_in:       boolean
}
