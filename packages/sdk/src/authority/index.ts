// Copyright 2025 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

// trana_authority module — PDA upgrade-authority management with passkey second factor

export { TranaAuthorityClient }        from "./client"
export type {
  TranaAuthorityClientOptions,
  AuthorityRecordAccount,
  TranaAuthority,
}                                      from "./client"
export { IDL as AUTHORITY_IDL }        from "./idl"

// Re-export core types used throughout the authority API
export { Policy, policyId, createConnection, PROGRAM_IDS, ENDPOINTS } from "../core/types"
export type { PasskeyHandle, TranaCluster }                             from "../core/types"
export { buildIntent, hashIntent, intentFromInstruction }               from "../core/intent"
export type { TranaIntent, IntentInput }                                from "../core/intent"
export { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx,
         SECP256R1_PROGRAM_ID }                                         from "../core/secp256r1"
export { registerPasskey, signIntent, TranaWebAuthnError }             from "../core/webauthn"
export type { RegistrationResult, SigningResult, WebAuthnErrorCode }   from "../core/webauthn"
