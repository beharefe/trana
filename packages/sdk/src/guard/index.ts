// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

// trana_guard module — passkey registry, proof building, policy enforcement

export { TranaGuardClient }               from "./client"
export type {
  TranaGuardClientOptions,
  PasskeyRegistryAccount,
  TranaConfigAccount,
  RegisterPasskeyResult,
  BuildProofResult,
  TranaGuard,
}                                         from "./client"
export { IDL as GUARD_IDL }              from "./idl"

// Re-export core types used throughout the guard API
export { Policy, policyId, createConnection, PROGRAM_IDS, ENDPOINTS } from "../core/types"
export type { PasskeyHandle, TranaCluster }                             from "../core/types"
export { buildIntent, hashIntent, intentFromInstruction }               from "../core/intent"
export type { TranaIntent, IntentInput }                                from "../core/intent"
export { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx,
         SECP256R1_PROGRAM_ID }                                         from "../core/secp256r1"
export { registerPasskey, signIntent, TranaWebAuthnError }             from "../core/webauthn"
export type { RegistrationResult, SigningResult, WebAuthnErrorCode }   from "../core/webauthn"
