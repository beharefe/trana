"use client"

import { useTranaContext } from "./provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PasskeyEntry = {
  /** Human-readable device label. Empty string in v1 (not stored on-chain). */
  label:        string
  credentialId: Uint8Array
  pubkey:       Uint8Array
  /** Unix timestamp when key was registered. 0 in v1 (not stored on-chain). */
  addedAt:      number
  isPrimary:    boolean
}

export type RecoveryState = {
  /** Unix timestamp when recovery was initiated */
  initiatedAt: number
  /** Unix timestamp when recovery becomes effective (initiatedAt + 72h) */
  effectiveAt: number
  /** Base58 pubkey of the wallet that initiated recovery */
  initiatedBy: string
}

export type UseTranaPasskeysResult = {
  /** Registered passkeys. Empty array if wallet has no registry. */
  passkeys:          PasskeyEntry[]
  /** True when >= 2 passkeys are registered (i.e. a backup exists). */
  hasBackup:         boolean
  /**
   * Add a new passkey for this wallet. Requires an existing passkey to sign.
   * Phase 2+: full implementation. Phase 1: throws — coming in v1.1.
   */
  addPasskey:        (label: string) => Promise<void>
  /**
   * Remove a passkey by its credential ID. Requires a DIFFERENT key to sign.
   * Phase 2+: full implementation. Phase 1: throws — coming in v1.1.
   */
  removePasskey:     (credentialId: Uint8Array) => Promise<void>
  /**
   * Initiate a 72-hour time-locked recovery with the wallet key alone.
   * Existing passkeys can cancel the recovery during the window.
   * Phase 2+: full implementation. Phase 1: throws — coming in v1.1.
   */
  initiateRecovery:  () => Promise<void>
  /** Active recovery state, or null if no recovery is in progress. */
  recoveryState:     RecoveryState | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const NOT_YET = "Multi-device support coming in v1.1"

/**
 * useTranaPasskeys — read passkey registration state and manage keys.
 *
 * Phase 1: returns single-key data from the v1 registry.
 *   addPasskey / removePasskey / initiateRecovery throw "coming in v1.1".
 *   Stable API — app code written against this hook works unchanged in Phase 2.
 *
 * Phase 2: full multi-key implementation (TwoFactorRegistryV2 on-chain).
 *
 * ```tsx
 * const { passkeys, hasBackup, addPasskey } = useTranaPasskeys()
 *
 * if (!hasBackup) {
 *   return <BannerNudge onAdd={() => addPasskey("Backup iPhone")} />
 * }
 * ```
 */
export function useTranaPasskeys(): UseTranaPasskeysResult {
  const { registry } = useTranaContext()

  const passkeys: PasskeyEntry[] = registry === null
    ? []
    : [{
        label:        "Primary Device",
        credentialId: registry.credentialId,
        pubkey:       registry.pubkey,
        addedAt:      0,
        isPrimary:    true,
      }]

  const hasBackup = passkeys.length > 1

  const addPasskey        = async (_label: string)             => { throw new Error(NOT_YET) }
  const removePasskey     = async (_credentialId: Uint8Array)  => { throw new Error(NOT_YET) }
  const initiateRecovery  = async ()                           => { throw new Error(NOT_YET) }

  return {
    passkeys,
    hasBackup,
    addPasskey,
    removePasskey,
    initiateRecovery,
    recoveryState: null,
  }
}
