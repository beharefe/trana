// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared types and constants for the Trana SDK.
 *
 * Import from the sub-path that matches your use-case:
 *   import { ... } from "@beharefe/sdk"          — core + guard re-exports
 *   import { ... } from "@beharefe/sdk/guard"    — guard module only
 *   import { ... } from "@beharefe/sdk/authority"— authority module only
 *   import { ... } from "@beharefe/sdk/testing"  — test utilities (never ship to prod)
 */

import { Connection, PublicKey } from "@solana/web3.js"

// ── Cluster / environment ─────────────────────────────────────────────────────

export type TranaCluster = "devnet" | "localnet" | "mainnet-beta" | "custom"

export const ENDPOINTS: Record<Exclude<TranaCluster, "custom">, { http: string; ws: string }> = {
  devnet: {
    http: "https://api.devnet.solana.com",
    ws:   "wss://api.devnet.solana.com",
  },
  localnet: {
    http: "http://127.0.0.1:8899",
    ws:   "ws://127.0.0.1:8900",
  },
  "mainnet-beta": {
    // IN PROGRESS: mainnet launch — program ID TBD, not yet deployed
    http: "https://api.mainnet-beta.solana.com",
    ws:   "wss://api.mainnet-beta.solana.com",
  },
}

/** Create a `Connection` for a well-known cluster. Pass your own for RPC customization. */
export function createConnection(
  cluster:    Exclude<TranaCluster, "custom">,
  commitment: "confirmed" | "finalized" = "confirmed",
): Connection {
  return new Connection(ENDPOINTS[cluster].http, commitment)
}

// ── Program IDs ───────────────────────────────────────────────────────────────

/** On-chain program IDs by cluster. */
export const PROGRAM_IDS = {
  guard: {
    devnet:         new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn"),
    localnet:       new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn"),
    "mainnet-beta": null, // IN PROGRESS: not yet deployed
  },
  authority: {
    devnet:         new PublicKey("TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN"),
    localnet:       new PublicKey("KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE"),
    "mainnet-beta": null, // IN PROGRESS: not yet deployed
  },
} as const

// ── Policy ────────────────────────────────────────────────────────────────────

/**
 * Mirrors the on-chain `Policy` enum exactly (Anchor IDL camelCase variant).
 *
 * All policy evaluation is enforced on-chain inside `trana_guard::enforce()`.
 * The client-side `policyId()` is for building record_proof — it is NOT enforced here.
 */
export type Policy =
  | { require:    Record<string, never> }
  | { notBefore:  { slot: bigint } }
  | { notAfter:   { slot: bigint } }
  | { limit:      { paramOffset: number; limit: bigint } }

/** Convenience constructors — match the Rust enum variants. */
export const Policy = {
  Require:   ():                          Policy => ({ require: {} }),
  NotBefore: (slot: bigint):              Policy => ({ notBefore: { slot } }),
  NotAfter:  (slot: bigint):              Policy => ({ notAfter:  { slot } }),
  Limit:     (limit: bigint, paramOffset = 0): Policy => ({ limit: { paramOffset, limit } }),
} as const

/** Canonical string ID used in `record_proof` payload and intent hash. */
export function policyId(p: Policy): string {
  if ("require"   in p) return "trana.require"
  if ("notBefore" in p) return "trana.not_before"
  if ("notAfter"  in p) return "trana.not_after"
  if ("limit"     in p) return "trana.limit"
  throw new Error("Unrecognized policy variant")
}

// ── Passkey handle ────────────────────────────────────────────────────────────

/**
 * A registered WebAuthn credential bound to an on-chain registry.
 *
 * Returned by `TranaGuardClient.registerPasskey()`.
 * Store this securely — `credentialId` is needed for every future signing operation.
 */
export type PasskeyHandle = {
  /** 33-byte compressed P-256 public key — stored in the on-chain registry PDA. */
  pubkeyBytes:  Uint8Array
  /**
   * Raw credential ID from the WebAuthn authenticator.
   * Required to locate the credential device-side for signing.
   * Store in `localStorage`, a user profile, or your backend.
   * This is NOT a secret — it is a handle, not a key.
   */
  credentialId: Uint8Array
}
