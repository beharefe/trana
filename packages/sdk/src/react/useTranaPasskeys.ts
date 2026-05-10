"use client"

import { useTranaContext } from "./provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PasskeyEntry = {
  credentialId: Uint8Array
  pubkey:       Uint8Array
}

export type UseTranaPasskeysResult = {
  /** All registered passkeys for this wallet. Empty if no registry exists. */
  passkeys:  PasskeyEntry[]
  /** True when >= 2 passkeys are registered (backup exists). */
  hasBackup: boolean
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useTranaPasskeys — read passkey registration state for the connected wallet.
 *
 * To add or remove passkeys, use `TranaGuardClient.addPasskey()` /
 * `TranaGuardClient.removePasskey()` directly — those are browser-only
 * operations that require the wallet adapter and WebAuthn.
 *
 * ```tsx
 * const { passkeys, hasBackup } = useTranaPasskeys()
 *
 * if (!hasBackup) {
 *   return <BackupNudge />
 * }
 * ```
 */
export function useTranaPasskeys(): UseTranaPasskeysResult {
  const { registry } = useTranaContext()

  const passkeys: PasskeyEntry[] = (registry?.keys ?? []).map(k => ({
    credentialId: k.credentialId,
    pubkey:       k.pubkey,
  }))

  return {
    passkeys,
    hasBackup: passkeys.length >= 2,
  }
}
