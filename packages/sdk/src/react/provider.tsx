"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react"
import { Connection, PublicKey } from "@solana/web3.js"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { fetchRegistry, findRegistryPda, subscribeRegistry, RegistryState } from "./registry"
import { tranaReducer, TranaConfig, TranaState } from "./state"
import { TranaIntent } from "./intent"

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalResult = {
  sig:               Uint8Array
  authenticatorData: Uint8Array
  clientDataJSON:    Uint8Array
}

type PendingDeferred =
  | { kind: "registration"; resolve: () => void;                  reject: (e: Error) => void }
  | { kind: "approval";     resolve: (r: ApprovalResult) => void; reject: (e: Error) => void }

export type TranaContextValue = {
  state:      TranaState
  config:     TranaConfig
  connection: Connection
  registry:   RegistryState | null
  /** useTrana: pause send flow until registration modal resolves */
  _triggerRegistration: () => Promise<void>
  /** useTrana: pause send flow until approval modal resolves */
  _triggerApproval: (intent: TranaIntent) => Promise<ApprovalResult>
  /** Modal: call when registration ceremony completes onchain */
  _resolveRegistration: () => void
  /** Modal: call with the WebAuthn result when approval completes */
  _resolveApproval: (result: ApprovalResult) => void
  /** Modal: call on cancel or error to unblock the send flow */
  _rejectPending: (message: string) => void
}

const TranaContext = createContext<TranaContextValue | null>(null)

export function useTranaContext(): TranaContextValue {
  const ctx = useContext(TranaContext)
  if (!ctx) throw new Error("useTranaContext must be used inside <TranaProvider>")
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────────

type TranaProviderProps = {
  children: React.ReactNode
  config:   TranaConfig
}

/**
 * TranaProvider — state and deferred promise hub.
 *
 * Provides context for useTrana() and <TranaModal />.
 * Does NOT intercept wallet.sendTransaction — call useTrana().send() explicitly.
 *
 * Placement:
 *   <TranaProvider config={...}>
 *     <App />
 *     <TranaModal />   ← place anywhere inside the provider
 *   </TranaProvider>
 */
export function TranaProvider({ children, config }: TranaProviderProps) {
  const { connection }  = useConnection()
  const { publicKey }   = useWallet()

  const [state, dispatch]     = useReducer(tranaReducer, { phase: "idle" })
  const [registry, setRegistry] = useState<RegistryState | null>(null)
  const pendingRef              = useRef<PendingDeferred | null>(null)

  // ── Registry subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!publicKey) { setRegistry(null); return }

    fetchRegistry(connection, publicKey, config.guardProgramId).then(setRegistry)

    const pda   = findRegistryPda(publicKey, config.guardProgramId)
    const subId = subscribeRegistry(connection, pda, setRegistry)

    return () => { connection.removeAccountChangeListener(subId) }
  }, [publicKey?.toBase58(), connection, config.guardProgramId.toBase58()])

  // ── Trigger helpers (called by useTrana) ──────────────────────────────────

  const _triggerRegistration = useCallback((): Promise<void> => {
    dispatch({ type: "TRIGGER_REGISTRATION" })
    return new Promise<void>((resolve, reject) => {
      pendingRef.current = { kind: "registration", resolve, reject }
    })
  }, [])

  const _triggerApproval = useCallback((intent: TranaIntent): Promise<ApprovalResult> => {
    dispatch({ type: "TRIGGER_APPROVAL", intent })
    return new Promise<ApprovalResult>((resolve, reject) => {
      pendingRef.current = { kind: "approval", resolve, reject }
    })
  }, [])

  // ── Resolve helpers (called by modal) ────────────────────────────────────

  const _resolveRegistration = useCallback(() => {
    if (pendingRef.current?.kind === "registration") {
      pendingRef.current.resolve()
      pendingRef.current = null
      dispatch({ type: "RESOLVE" })
    }
  }, [])

  const _resolveApproval = useCallback((result: ApprovalResult) => {
    if (pendingRef.current?.kind === "approval") {
      pendingRef.current.resolve(result)
      pendingRef.current = null
      dispatch({ type: "RESOLVE" })
    }
  }, [])

  const _rejectPending = useCallback((message: string) => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error(message))
      pendingRef.current = null
    }
    dispatch({ type: "RESET" })
  }, [])

  return (
    <TranaContext.Provider value={{
      state,
      config,
      connection,
      registry,
      _triggerRegistration,
      _triggerApproval,
      _resolveRegistration,
      _resolveApproval,
      _rejectPending,
    }}>
      {children}
    </TranaContext.Provider>
  )
}
