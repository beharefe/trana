"use client"

import { useEffect, useRef, useState } from "react"
import { useTranaContext } from "./provider"

const NUDGE_KEY = "trana_backup_nudge_shown"
const NUDGE_DELAY_MS = 2000

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackupNudgeState = {
  /** True when the nudge should be displayed. */
  show: boolean
  /** Call to permanently dismiss (stores flag in localStorage). */
  dismiss: () => void
  /**
   * Call to open key management — dismisses nudge and calls your provided
   * onOpenKeyManagement callback. Wire this to your key management UI.
   */
  openKeyManagement: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useBackupNudge — surface a one-time prompt to add a backup passkey.
 *
 * After the first successful passkey approval, waits 2 seconds then sets
 * `show: true` — once per browser profile (stored in localStorage).
 * The SDK provides only the state; rendering the actual banner/toast is
 * left to the app so it can match the product design.
 *
 * ```tsx
 * const { show, dismiss, openKeyManagement } = useBackupNudge({
 *   onOpen: () => setShowKeyMgmt(true),
 * })
 *
 * {show && (
 *   <BackupBanner onDismiss={dismiss} onSetupBackup={openKeyManagement} />
 * )}
 * ```
 */
export function useBackupNudge(options?: {
  /** Called when the user clicks "Add backup device" */
  onOpen?: () => void
}): BackupNudgeState {
  const { state } = useTranaContext()
  const [show, setShow] = useState(false)
  const prevPhaseRef    = useRef(state.phase)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const prev    = prevPhaseRef.current
    const current = state.phase

    if (prev !== current) {
      prevPhaseRef.current = current

      if (prev === "approving" && current === "idle") {
        if (typeof window !== "undefined" && !localStorage.getItem(NUDGE_KEY)) {
          timerRef.current = setTimeout(() => setShow(true), NUDGE_DELAY_MS)
        }
      } else if (current !== "idle" && timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [state.phase])

  const dismiss = () => {
    setShow(false)
    if (typeof window !== "undefined") {
      localStorage.setItem(NUDGE_KEY, "1")
    }
  }

  const openKeyManagement = () => {
    dismiss()
    options?.onOpen?.()
  }

  return { show, dismiss, openKeyManagement }
}
