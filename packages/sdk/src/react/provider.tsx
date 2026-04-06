"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react"
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { buildSecp256r1Ix, buildWebAuthnMessage } from "../secp256r1"
import { fetchRegistry, findRegistryPda, subscribeRegistry, RegistryState } from "./registry"
import { detectEnforcement } from "./detector"
import { buildIntent, intentToPayloadHash, TranaIntent } from "./intent"
import { tranaReducer, TranaAction, TranaConfig, TranaState } from "./state"
import { TranaModal } from "./modal"

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111"
)

// SystemProgram instruction type 4 = AdvanceNonceAccount
const NONCE_ADVANCE_TYPE = 4

// ── Context ───────────────────────────────────────────────────────────────────

type ApprovalResult = {
  sig:               Uint8Array
  authenticatorData: Uint8Array
  clientDataJSON:    Uint8Array
}

type PendingDeferred =
  | { kind: "registration"; resolve: () => void;               reject: (e: Error) => void }
  | { kind: "approval";     resolve: (r: ApprovalResult) => void; reject: (e: Error) => void }

export type TranaContextValue = {
  state:           TranaState
  sendTransaction: (
    tx:   Transaction | VersionedTransaction,
    conn: Connection,
    opts?: Parameters<ReturnType<typeof useWallet>["sendTransaction"]>[2]
  ) => Promise<string>
  /** Exposed for modal — resolves the registration deferred promise. */
  _resolveRegistration: () => void
  /** Exposed for modal — resolves the approval deferred promise. */
  _resolveApproval: (result: ApprovalResult) => void
  /** Exposed for modal — rejects whatever is pending. */
  _rejectPending: (message: string) => void
  config:     TranaConfig
  connection: Connection
  registry:   RegistryState | null
}

const TranaContext = createContext<TranaContextValue | null>(null)

export function useTranaContext(): TranaContextValue {
  const ctx = useContext(TranaContext)
  if (!ctx) throw new Error("useTranaContext must be used inside <TranaProvider>")
  return ctx
}

// ── Safe instruction insertion ────────────────────────────────────────────────

function isNonceAdvance(ix: TransactionInstruction): boolean {
  return (
    ix.programId.equals(SystemProgram.programId) &&
    ix.data.length >= 4 &&
    ix.data.readUInt32LE(0) === NONCE_ADVANCE_TYPE
  )
}

/**
 * Insert the secp256r1 proof instruction at the correct position:
 * - After durable nonce advance (must stay at index 0)
 * - After any ComputeBudget instructions
 * - Otherwise at index 0
 */
function insertProofIx(
  tx:      Transaction,
  proofIx: TransactionInstruction
): Transaction {
  const ixs = [...tx.instructions]
  let insertAt = 0

  // Skip durable nonce advance — it must be instruction 0
  if (ixs[0] && isNonceAdvance(ixs[0])) insertAt = 1

  // Skip ComputeBudget instructions
  while (
    insertAt < ixs.length &&
    ixs[insertAt].programId.equals(COMPUTE_BUDGET_PROGRAM_ID)
  ) {
    insertAt++
  }

  ixs.splice(insertAt, 0, proofIx)
  tx.instructions = ixs
  return tx
}

// ── Provider ──────────────────────────────────────────────────────────────────

type TranaProviderProps = {
  children: React.ReactNode
  config:   TranaConfig
}

export function TranaProvider({ children, config }: TranaProviderProps) {
  const { connection }                  = useConnection()
  const { publicKey, sendTransaction: walletSend, signTransaction } = useWallet()

  const [state, dispatch] = useReducer(tranaReducer, { phase: "idle" })

  // Registry state cached in a ref — kept hot via onAccountChange subscription
  const registryRef    = useRef<RegistryState | null>(null)
  const subIdRef       = useRef<number | null>(null)
  const pendingRef     = useRef<PendingDeferred | null>(null)

  // ── Registry subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!publicKey) {
      registryRef.current = null
      return
    }

    // Initial fetch
    fetchRegistry(connection, publicKey, config.guardProgramId).then(state => {
      registryRef.current = state
    })

    // Subscribe to live updates
    const pda = findRegistryPda(publicKey, config.guardProgramId)
    const subId = subscribeRegistry(connection, pda, state => {
      registryRef.current = state
    })
    subIdRef.current = subId

    return () => {
      if (subIdRef.current !== null) {
        connection.removeAccountChangeListener(subIdRef.current)
        subIdRef.current = null
      }
    }
  }, [publicKey?.toBase58(), connection, config.guardProgramId.toBase58()])

  // ── Deferred promise helpers ──────────────────────────────────────────────

  const _resolveRegistration = useCallback(() => {
    if (pendingRef.current?.kind === "registration") {
      pendingRef.current.resolve()
      pendingRef.current = null
    }
  }, [])

  const _resolveApproval = useCallback((result: ApprovalResult) => {
    if (pendingRef.current?.kind === "approval") {
      pendingRef.current.resolve(result)
      pendingRef.current = null
    }
  }, [])

  const _rejectPending = useCallback((message: string) => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error(message))
      pendingRef.current = null
    }
    dispatch({ type: "RESET" })
  }, [])

  // ── sendTransaction interceptor ───────────────────────────────────────────

  const sendTransaction = useCallback(async (
    tx:   Transaction | VersionedTransaction,
    conn: Connection,
    opts?: Parameters<typeof walletSend>[2]
  ): Promise<string> => {
    if (!publicKey) throw new Error("Wallet not connected")

    dispatch({ type: "SIMULATE" })

    try {
      const detection = await detectEnforcement(
        tx,
        conn,
        publicKey,
        config.guardProgramId
      )

      // No enforcement needed — pass through directly
      if (!detection.needed) {
        dispatch({ type: "SEND" })
        const sig = await walletSend(tx, conn, opts)
        dispatch({ type: "DONE" })
        return sig
      }

      // ── Registration required ─────────────────────────────────────────────
      if (detection.reason === "no-registry") {
        dispatch({ type: "NEEDS_REGISTRATION" })

        await new Promise<void>((resolve, reject) => {
          pendingRef.current = { kind: "registration", resolve, reject }
        })

        // After registration, refresh registry ref
        const registry = await fetchRegistry(conn, publicKey, config.guardProgramId)
        registryRef.current = registry

        // Re-detect now that registry exists
        const detection2 = await detectEnforcement(tx, conn, publicKey, config.guardProgramId)
        if (!detection2.needed) {
          dispatch({ type: "SEND" })
          const sig = await walletSend(tx, conn, opts)
          dispatch({ type: "DONE" })
          return sig
        }
      }

      // ── Approval required ─────────────────────────────────────────────────
      const registry = registryRef.current
      if (!registry) throw new Error("Registry not found after registration")

      const intent = buildIntent(
        publicKey,
        config.guardProgramId,
        config.policy,
        registry.nonce,
        config.expiryTtlSec
      )

      dispatch({ type: "NEEDS_APPROVAL", intent })

      const approval = await new Promise<ApprovalResult>((resolve, reject) => {
        pendingRef.current = { kind: "approval", resolve, reject }
      })

      dispatch({ type: "SEND" })

      // Build secp256r1 verify instruction
      const payloadHash = intentToPayloadHash(intent)
      const webAuthnMsg = buildWebAuthnMessage(
        approval.authenticatorData,
        approval.clientDataJSON
      )
      const proofIx = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)

      // Insert at safe position and refresh blockhash
      if (tx instanceof Transaction) {
        insertProofIx(tx, proofIx)
        const { blockhash } = await conn.getLatestBlockhash("confirmed")
        tx.recentBlockhash = blockhash

        // Re-sign with wallet after blockhash refresh
        if (signTransaction) {
          const signed = await signTransaction(tx)
          const rawSig = await conn.sendRawTransaction(signed.serialize())
          dispatch({ type: "DONE" })
          return rawSig
        }
      }

      // Fallback: let wallet handle signing
      const sig = await walletSend(tx, conn, opts)
      dispatch({ type: "DONE" })
      return sig

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed"
      dispatch({ type: "ERROR", message })
      throw err
    }
  }, [publicKey, walletSend, signTransaction, config, connection])

  // ── Context value ─────────────────────────────────────────────────────────

  const contextValue: TranaContextValue = {
    state,
    sendTransaction,
    _resolveRegistration,
    _resolveApproval,
    _rejectPending,
    config,
    connection,
    registry: registryRef.current,
  }

  return (
    <TranaContext.Provider value={contextValue}>
      {children}
      <TranaModal />
    </TranaContext.Provider>
  )
}
