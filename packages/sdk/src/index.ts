// Copyright 2025 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * @tranaprotocol/sdk — top-level barrel.
 *
 * For most use-cases, import from the sub-path that matches your module:
 *   import { TranaGuardClient }     from "@tranaprotocol/sdk/guard"
 *   import { TranaAuthorityClient } from "@tranaprotocol/sdk/authority"
 *   import { generateTestPasskey }  from "@tranaprotocol/sdk/testing"  // never in prod
 *
 * This root export re-exports the most commonly used types and the two clients
 * for convenience when tree-shaking is handled by your bundler.
 */

// ── Guard module ──────────────────────────────────────────────────────────────
export { TranaGuardClient }               from "./guard/client"
export type {
  TranaGuardClientOptions,
  TwoFactorRegistryAccount,
  TranaConfigAccount,
  RegisterPasskeyResult,
  BuildProofResult,
  TranaGuard,
}                                         from "./guard/client"
export { IDL as GUARD_IDL }              from "./guard/idl"

// ── Authority module ──────────────────────────────────────────────────────────
export { TranaAuthorityClient }           from "./authority/client"
export type {
  TranaAuthorityClientOptions,
  AuthorityRecordAccount,
  TranaAuthority,
}                                         from "./authority/client"
export { IDL as AUTHORITY_IDL }          from "./authority/idl"

// ── Core types (shared by both modules) ──────────────────────────────────────
export { Policy, policyId, createConnection, PROGRAM_IDS, ENDPOINTS } from "./core/types"
export type { PasskeyHandle, TranaCluster }                             from "./core/types"
export { buildIntent, hashIntent, intentFromInstruction }               from "./core/intent"
export type { TranaIntent, IntentInput }                                from "./core/intent"
export { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx,
         SECP256R1_PROGRAM_ID }                                         from "./core/secp256r1"
export { registerPasskey, signIntent, TranaWebAuthnError }             from "./core/webauthn"
export type { RegistrationResult, SigningResult, WebAuthnErrorCode }   from "./core/webauthn"
