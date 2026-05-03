// ── Policy helpers ────────────────────────────────────────────────────────────
export { evaluatePolicy, policyString, type Policy } from "./policy"

// ── Requirement check (client-side, UX only) ──────────────────────────────────
export { checkRequirement } from "./requirement"

// ── Utilities ─────────────────────────────────────────────────────────────────
export { sha256, sha256Bytes, generateNonce, decodeParamsU64 } from "./utils"

// ── secp256r1 precompile ──────────────────────────────────────────────────────
export {
  SECP256R1_PROGRAM_ID,
  buildSecp256r1Ix,
  buildWebAuthnMessage,
  buildRecordProofIx,
} from "./secp256r1"

// ── React: provider + hook ────────────────────────────────────────────────────
//
//   1. Wrap app:  <TranaProvider config={...}><App /><TranaModal /></TranaProvider>
//   2. Hook:      const { authorizeAndSend } = useTrana()
//   3. Call:      await authorizeAndSend({ instruction: ix, label: "..." })
//
export { TranaProvider, useTranaContext } from "./react/provider"
export type { TranaContextValue } from "./react/provider"
export { useTrana } from "./react/useTrana"
export type { AuthorizeAndSendArgs, IntentInput } from "./react/useTrana"
export { TranaModal } from "./react/modal"
export type { TranaConfig, TranaState, TranaAction } from "./react/state"

// ── Intent ────────────────────────────────────────────────────────────────────
export type { TranaIntent } from "./react/intent"
export { buildIntent, hashIntent, intentToPayloadHash, intentFromInstruction } from "./react/intent"

// ── Registry ──────────────────────────────────────────────────────────────────
export { findRegistryPda, fetchRegistry } from "./react/registry"
export type { RegistryState } from "./react/registry"

// ── Detection ─────────────────────────────────────────────────────────────────
export { detectEnforcement, hasSecp256r1Ix } from "./react/detector"
export type { DetectionResult } from "./react/detector"

// ── WebAuthn (browser only) ───────────────────────────────────────────────────
export { doRegistration, doApproval, derToCompact, lowS, extractPubkeyFromAttestation } from "./react/webauthn"

// ── Error helpers ─────────────────────────────────────────────────────────────
export { isTranaError, parseTranaError } from "./react/error"
export type { TranaErrorKind } from "./react/error"

// ── Passkey management ────────────────────────────────────────────────────────
export { useTranaPasskeys } from "./react/useTranaPasskeys"
export type { PasskeyEntry, RecoveryState, UseTranaPasskeysResult } from "./react/useTranaPasskeys"

// ── Backup nudge ──────────────────────────────────────────────────────────────
export { useBackupNudge } from "./react/useBackupNudge"
export type { BackupNudgeState } from "./react/useBackupNudge"
