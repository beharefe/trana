"use client"

import React, { useCallback, useEffect, useState } from "react"
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import { useWallet } from "@solana/wallet-adapter-react"
import { useTranaContext } from "./provider"
import { doRegistration, doApproval } from "./webauthn"
import { hashIntent } from "./intent"
import { decodeParamsU64 } from "../utils"

// ── Inline styles (no Tailwind dependency from SDK) ───────────────────────────

const OVERLAY: React.CSSProperties = {
  position:       "fixed",
  inset:          0,
  background:     "rgba(0,0,0,0.65)",
  backdropFilter: "blur(4px)",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  zIndex:         9999,
}

const CARD: React.CSSProperties = {
  background:   "#0f0f0f",
  border:       "1px solid #2a2a2a",
  borderRadius: "16px",
  padding:      "32px",
  maxWidth:     "420px",
  width:        "90vw",
  color:        "#f5f5f5",
  fontFamily:   "system-ui, sans-serif",
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize:      "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color:         "#666",
  marginBottom:  "8px",
}

const HEADING: React.CSSProperties = {
  fontSize:     "20px",
  fontWeight:   600,
  marginBottom: "12px",
  lineHeight:   1.3,
}

const BODY: React.CSSProperties = {
  fontSize:     "14px",
  color:        "#999",
  lineHeight:   1.6,
  marginBottom: "24px",
}

const BTN_PRIMARY: React.CSSProperties = {
  width:        "100%",
  padding:      "12px 20px",
  background:   "#16A34A",
  color:        "#fff",
  border:       "none",
  borderRadius: "10px",
  fontSize:     "14px",
  fontWeight:   600,
  cursor:       "pointer",
  transition:   "opacity 0.15s",
}

const BTN_GHOST: React.CSSProperties = {
  width:        "100%",
  padding:      "10px 20px",
  background:   "transparent",
  color:        "#666",
  border:       "none",
  borderRadius: "10px",
  fontSize:     "13px",
  cursor:       "pointer",
  marginTop:    "8px",
}

const DETAIL_ROW: React.CSSProperties = {
  display:        "flex",
  justifyContent: "space-between",
  alignItems:     "center",
  fontSize:       "12px",
  padding:        "6px 0",
  borderBottom:   "1px solid #1a1a1a",
}

// ── Guard error code → human string ─────────────────────────────────────────

const GUARD_ERRORS: Record<string, string> = {
  ProofExpired:      "Took too long — please try again",
  PayloadMismatch:   "Something changed — please try again",
  WrongSigner:       "Wrong device — use the one you registered with",
  MissingProof:      "Security check failed — please try again",
  RegistryDisabled:  "Passkey not set up — please register first",
  PolicyMismatch:    "Policy mismatch — please try again",
}

function humanizeError(message: string): { text: string; recoverable: boolean } {
  for (const [code, text] of Object.entries(GUARD_ERRORS)) {
    if (message.includes(code)) return { text, recoverable: true }
  }
  if (message === "Cancelled") return { text: "Cancelled", recoverable: false }
  return { text: message.length > 100 ? message.slice(0, 100) + "…" : message, recoverable: true }
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, labels }: { current: 1 | 2; labels: [string, string] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
      {labels.map((label, i) => {
        const step   = i + 1
        const done   = step < current
        const active = step === current
        return (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", opacity: active || done ? 1 : 0.35 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background:   done ? "#16A34A" : active ? "#f5f5f5" : "transparent",
                border:       `1.5px solid ${done || active ? "#16A34A" : "#444"}`,
                display:      "flex", alignItems: "center", justifyContent: "center",
                fontSize:     "10px", fontWeight: 700,
                color:        done ? "#fff" : active ? "#000" : "#666",
              }}>
                {done ? "✓" : step}
              </div>
              <span style={{ fontSize: "11px", color: active ? "#f5f5f5" : done ? "#16A34A" : "#555", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? "#16A34A" : "#2a2a2a", minWidth: 8 }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatSol(lamports: bigint): string {
  return (Number(lamports) / 1e9).toFixed(4) + " SOL"
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onEscape])
}

const REGISTER_DISCRIMINATOR = Buffer.from([
  0x63, 0xef, 0x62, 0x7d, 0x8a, 0x0c, 0x95, 0x4e,
])

// ── register_two_fa instruction builder ──────────────────────────────────────

function buildRegisterIx(
  walletPubkey:   PublicKey,
  guardProgramId: PublicKey,
  pubkey:         Uint8Array,
  credentialId:   Uint8Array
): TransactionInstruction {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("2fa"), walletPubkey.toBuffer()],
    guardProgramId
  )

  const pkLenBuf   = Buffer.allocUnsafe(4)
  new DataView(pkLenBuf.buffer, pkLenBuf.byteOffset, 4).setUint32(0, pubkey.length, true)
  const credLenBuf = Buffer.allocUnsafe(4)
  new DataView(credLenBuf.buffer, credLenBuf.byteOffset, 4).setUint32(0, credentialId.length, true)

  const ixData = Buffer.concat([
    REGISTER_DISCRIMINATOR,
    Buffer.from([0]),
    pkLenBuf,
    Buffer.from(pubkey),
    credLenBuf,
    Buffer.from(credentialId),
  ])

  return new TransactionInstruction({
    programId: guardProgramId,
    keys: [
      { pubkey: registryPda,             isSigner: false, isWritable: true  },
      { pubkey: walletPubkey,            isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData,
  })
}

// ── Registration modal ────────────────────────────────────────────────────────

function RegistrationModal() {
  const { state, _resolveRegistration, _rejectPending, config, connection } = useTranaContext()
  const { publicKey, signTransaction } = useWallet()
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle")
  const [error, setError]   = useState<string | null>(null)

  if (state.phase !== "needs-registration" && state.phase !== "registering") return null

  const preview = state.phase === "needs-registration" ? state.intentPreview : undefined
  const actionText = preview?.amountSol
    ? `${preview.label ?? "This action"} (${preview.amountSol})`
    : preview?.label ?? "This action"

  useEscapeKey(() => _rejectPending("Cancelled"))

  const handleSetup = useCallback(async () => {
    if (!publicKey || !signTransaction) return
    setStatus("working")
    setError(null)
    try {
      const { credentialId, pubkey } = await doRegistration(config.rpId)
      const registerIx = buildRegisterIx(publicKey, config.guardProgramId, pubkey, credentialId)
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(registerIx)
      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")
      _resolveRegistration()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Setup failed")
      setStatus("error")
    }
  }, [publicKey, signTransaction, connection, config, _resolveRegistration])

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <p style={LABEL_STYLE}>Trana Guard</p>
        <h2 style={HEADING}>{actionText} requires device confirmation</h2>
        <p style={BODY}>
          Set up once — instant approvals from this device going forward.
          Your passkey is backed up automatically via iCloud Keychain or Google Password Manager.
        </p>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>{error}</p>
        )}

        <button
          style={{ ...BTN_PRIMARY, opacity: status === "working" ? 0.6 : 1 }}
          onClick={handleSetup}
          disabled={status === "working"}
        >
          {status === "working" ? "Setting up…" : "Set up with Touch ID"}
        </button>
        <button style={BTN_GHOST} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
      </div>
    </div>
  )
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmationModal() {
  const { state, _resolveConfirmation, _rejectPending } = useTranaContext()

  if (state.phase !== "needs-confirmation" && state.phase !== "confirming") return null
  const { intent, label } = state

  useEscapeKey(() => _rejectPending("Cancelled"))

  const busy          = state.phase === "confirming"
  const rawBytes      = intent.rawParamsHex.length >= 16 ? Buffer.from(intent.rawParamsHex.slice(0, 16), "hex") : null
  const decodedLamports = rawBytes ? decodeParamsU64(rawBytes) : null
  const decodedSol    = decodedLamports !== null ? formatSol(decodedLamports) : null

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <StepIndicator current={1} labels={["Review", "Confirm with Touch ID"]} />

        <p style={LABEL_STYLE}>Trana Guard · Review</p>
        <h2 style={HEADING}>{label ?? "Confirm this action"}</h2>
        <p style={{ ...BODY, marginBottom: "16px" }}>
          Review what you&apos;re authorizing before confirming with your device.
        </p>

        <div style={{ marginBottom: "20px" }}>
          {label && (
            <div style={DETAIL_ROW}>
              <span style={{ color: "#666" }}>Action <span style={{ fontSize: "10px", color: "#444" }}>(app label)</span></span>
              <span style={{ fontWeight: 600 }}>{label}</span>
            </div>
          )}
          {decodedSol && (
            <div style={DETAIL_ROW}>
              <span style={{ color: "#666" }}>Amount <span style={{ fontSize: "10px", color: "#16A34A" }}>(from transaction)</span></span>
              <span style={{ fontWeight: 700, color: "#f5f5f5" }}>{decodedSol}</span>
            </div>
          )}
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Policy</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{intent.policyId}</span>
          </div>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Program</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{shortAddr(intent.targetProgramId)}</span>
          </div>
          <div style={{ ...DETAIL_ROW, borderBottom: "none" }}>
            <span style={{ color: "#666" }}>Accounts</span>
            <span style={{ fontSize: "11px", color: "#888" }}>{intent.accountsCount} addresses bound</span>
          </div>
        </div>

        <button
          style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }}
          onClick={_resolveConfirmation}
          disabled={busy}
        >
          {busy ? "Waiting for device…" : "Approve with device →"}
        </button>
        <button style={BTN_GHOST} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
      </div>
    </div>
  )
}

// ── Approval modal ────────────────────────────────────────────────────────────

function ApprovalModal() {
  const { state, _resolveApproval, _rejectPending, config, registry } = useTranaContext()
  const [status, setStatus]       = useState<"idle" | "working" | "error">("idle")
  const [error, setError]         = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  if (state.phase !== "needs-approval" && state.phase !== "approving") return null
  const intent = state.intent

  useEffect(() => {
    const tick = () => {
      const remaining = intent.expiryUnix - Math.floor(Date.now() / 1000)
      setCountdown(remaining > 0 ? remaining : 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [intent.expiryUnix])

  useEscapeKey(() => _rejectPending("Cancelled"))

  const handleApprove = useCallback(async () => {
    if (!registry) { setError("Device not set up"); return }
    setStatus("working")
    setError(null)
    try {
      const challenge = hashIntent(intent)
      const result    = await doApproval(registry.credentialId, challenge, config.rpId)
      _resolveApproval(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approval failed")
      setStatus("error")
    }
  }, [intent, config, registry, _resolveApproval])

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <StepIndicator current={2} labels={["Review", "Confirm with Touch ID"]} />

        <p style={LABEL_STYLE}>Trana Guard · Confirmation required</p>
        <h2 style={HEADING}>Approve this action</h2>

        <div style={{ marginBottom: "20px" }}>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Policy</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{intent.policyId}</span>
          </div>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Program</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{shortAddr(intent.targetProgramId)}</span>
          </div>
          <div style={{ ...DETAIL_ROW, borderBottom: "none" }}>
            <span style={{ color: "#666" }}>Expires in</span>
            <span style={{ color: countdown !== null && countdown < 30 ? "#ef4444" : "#16A34A" }}>
              {countdown !== null ? `${countdown}s` : "…"}
            </span>
          </div>
        </div>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>{error}</p>
        )}

        <button
          style={{ ...BTN_PRIMARY, opacity: status === "working" ? 0.6 : 1 }}
          onClick={handleApprove}
          disabled={status === "working" || countdown === 0}
        >
          {status === "working" ? "Waiting for device…" : "Approve with device"}
        </button>
        <button style={BTN_GHOST} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
      </div>
    </div>
  )
}

// ── Error modal ───────────────────────────────────────────────────────────────

function ErrorModal() {
  const { state, _rejectPending } = useTranaContext()

  if (state.phase !== "error") return null

  const { text, recoverable } = humanizeError(state.message)
  useEscapeKey(() => _rejectPending("Cancelled"))

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <p style={LABEL_STYLE}>Trana Guard</p>
        <h2 style={{ ...HEADING, color: "#ef4444" }}>Something went wrong</h2>
        <p style={BODY}>{text}</p>
        {recoverable ? (
          <button style={BTN_PRIMARY} onClick={() => _rejectPending("Cancelled")}>
            Try again
          </button>
        ) : (
          <button style={BTN_PRIMARY} onClick={() => _rejectPending("Cancelled")}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}

// ── Combined modal entry point ────────────────────────────────────────────────

/**
 * Place <TranaModal /> anywhere inside <TranaProvider> to render the
 * registration, confirmation, approval, and error modals when needed.
 *
 *   <TranaProvider config={...}>
 *     <App />
 *     <TranaModal />
 *   </TranaProvider>
 */
export function TranaModal() {
  const { state } = useTranaContext()

  if (state.phase === "needs-registration" || state.phase === "registering")   return <RegistrationModal />
  if (state.phase === "needs-confirmation" || state.phase === "confirming")    return <ConfirmationModal />
  if (state.phase === "needs-approval"     || state.phase === "approving")     return <ApprovalModal />
  if (state.phase === "error")                                                 return <ErrorModal />
  return null
}
