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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999,
  } as React.CSSProperties,

  card: {
    background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "16px",
    padding: "28px", maxWidth: "400px", width: "90vw",
    color: "#f5f5f5", fontFamily: "system-ui, sans-serif",
  } as React.CSSProperties,

  label: {
    fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" as const,
    color: "#555", marginBottom: "6px",
  } as React.CSSProperties,

  heading: { fontSize: "19px", fontWeight: 600, marginBottom: "10px", lineHeight: 1.3 } as React.CSSProperties,
  body:    { fontSize: "14px", color: "#888", lineHeight: 1.6, marginBottom: "20px" } as React.CSSProperties,

  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: "12px", padding: "6px 0", borderBottom: "1px solid #1a1a1a",
  } as React.CSSProperties,

  primary: {
    width: "100%", padding: "11px 20px", background: "#16A34A",
    color: "#fff", border: "none", borderRadius: "10px",
    fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s",
  } as React.CSSProperties,

  ghost: {
    width: "100%", padding: "9px 20px", background: "transparent",
    color: "#555", border: "none", fontSize: "13px", cursor: "pointer", marginTop: "6px",
  } as React.CSSProperties,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TRANA_GUARD_ERRORS: Record<string, string> = {
  ProofExpired:     "Took too long — please try again",
  PayloadMismatch:  "Something changed — please try again",
  WrongSigner:      "Wrong device — use the one you registered with",
  MissingProof:     "Security check failed — please try again",
  PolicyMismatch:   "Policy mismatch — please try again",
  RegistryDisabled: "Passkey not set up",
}

function humanizeError(msg: string) {
  for (const [code, text] of Object.entries(TRANA_GUARD_ERRORS)) {
    if (msg.includes(code)) return { text, recoverable: true }
  }
  if (msg === "Cancelled") return { text: "Cancelled", recoverable: false }
  return { text: msg.length > 100 ? msg.slice(0, 100) + "…" : msg, recoverable: true }
}

function formatSol(lamports: bigint) {
  return (Number(lamports) / 1e9).toFixed(4) + " SOL"
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function useEscapeKey(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [fn])
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 }) {
  const labels = ["Review", "Approve"]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
      {labels.map((label, i) => {
        const step   = i + 1
        const done   = step < current
        const active = step === current
        return (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", opacity: active || done ? 1 : 0.3 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: done ? "#16A34A" : active ? "#f5f5f5" : "transparent",
                border: `1.5px solid ${done || active ? "#16A34A" : "#444"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "9px", fontWeight: 700,
                color: done ? "#fff" : active ? "#000" : "#555",
              }}>
                {done ? "✓" : step}
              </div>
              <span style={{ fontSize: "11px", color: active ? "#f5f5f5" : done ? "#16A34A" : "#555", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i === 0 && <div style={{ flex: 1, height: 1, background: done ? "#16A34A" : "#2a2a2a", minWidth: 8 }} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── register_two_fa instruction ────────────────────────────────────────────────

// sha256("global:register_two_fa")[0:8]
const REGISTER_DISC = Buffer.from([0xd0, 0x77, 0x84, 0xf6, 0xfb, 0xec, 0x77, 0x36])

function buildRegisterIx(
  walletPubkey:        PublicKey,
  tranaGuardProgramId: PublicKey,
  pubkey:              Uint8Array,
  credentialId:        Uint8Array,
  configPda:           PublicKey,
  treasury:            PublicKey,
): TransactionInstruction {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("2fa"), walletPubkey.toBuffer()],
    tranaGuardProgramId,
  )
  const u32le = (n: number) => { const b = Buffer.allocUnsafe(4); new DataView(b.buffer, b.byteOffset, 4).setUint32(0, n, true); return b }
  return new TransactionInstruction({
    programId: tranaGuardProgramId,
    keys: [
      { pubkey: registryPda,             isSigner: false, isWritable: true  },
      { pubkey: walletPubkey,            isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: configPda,               isSigner: false, isWritable: false },
      { pubkey: treasury,                isSigner: false, isWritable: true  },
    ],
    data: Buffer.concat([
      REGISTER_DISC,
      Buffer.from([0]),
      u32le(pubkey.length),       Buffer.from(pubkey),
      u32le(credentialId.length), Buffer.from(credentialId),
    ]),
  })
}

// ── Modals ─────────────────────────────────────────────────────────────────────

function Overlay({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div style={s.overlay} onClick={onDismiss}>
      <div style={s.card} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function RegistrationModal() {
  const { state, _resolveRegistration, _rejectPending, config, connection } = useTranaContext()
  const { publicKey, signTransaction } = useWallet()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.phase !== "needs-registration" && state.phase !== "registering") return null

  const preview    = state.phase === "needs-registration" ? state.intentPreview : undefined
  const actionText = preview?.amountSol
    ? `${preview.label ?? "This action"} (${preview.amountSol} SOL)`
    : preview?.label ?? "This action"

  useEscapeKey(() => _rejectPending("Cancelled"))

  const handleSetup = useCallback(async () => {
    if (!publicKey || !signTransaction) return
    setBusy(true); setError(null)
    try {
      // Derive config PDA and fetch treasury address from on-chain state.
      // TranaConfig layout (after 8-byte discriminator):
      //   authority [32], treasury [32], register_fee [8], recovery_fee [8]
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")], config.tranaGuardProgramId,
      )
      const configAccount = await connection.getAccountInfo(configPda)
      if (!configAccount) throw new Error("Trana config not initialized — contact support")
      const treasury = new PublicKey(configAccount.data.slice(40, 72))

      const { credentialId, pubkey } = await doRegistration(config.rpId)
      const registerIx = buildRegisterIx(publicKey, config.tranaGuardProgramId, pubkey, credentialId, configPda, treasury)
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(registerIx)
      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")
      _resolveRegistration()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
      setBusy(false)
    }
  }, [publicKey, signTransaction, connection, config, _resolveRegistration])

  return (
    <Overlay onDismiss={() => _rejectPending("Cancelled")}>
      <p style={s.label}>Trana Guard</p>
      <h2 style={s.heading}>{actionText} requires device confirmation</h2>
      <p style={s.body}>
        Set up once — instant approvals from this device going forward.
        Your passkey syncs automatically via iCloud Keychain or Google Password Manager.
      </p>
      {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "14px" }}>{error}</p>}
      <button style={{ ...s.primary, opacity: busy ? 0.6 : 1 }} onClick={handleSetup} disabled={busy}>
        {busy ? "Setting up…" : "Set up passkey"}
      </button>
      <button style={s.ghost} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
    </Overlay>
  )
}

function ConfirmationModal() {
  const { state, _resolveConfirmation, _rejectPending } = useTranaContext()

  if (state.phase !== "needs-confirmation" && state.phase !== "confirming") return null
  const { intent, label } = state

  useEscapeKey(() => _rejectPending("Cancelled"))

  const busy = state.phase === "confirming"
  const rawBytes        = intent.rawParamsHex.length >= 16 ? Buffer.from(intent.rawParamsHex.slice(0, 16), "hex") : null
  const decodedLamports = rawBytes ? decodeParamsU64(rawBytes) : null
  const decodedSol      = decodedLamports !== null ? formatSol(decodedLamports) : null

  return (
    <Overlay onDismiss={() => _rejectPending("Cancelled")}>
      <Steps current={1} />
      <p style={s.label}>Review</p>
      <h2 style={s.heading}>{label ?? "Confirm this action"}</h2>
      <div style={{ marginBottom: "18px" }}>
        {label     && <div style={s.row}><span style={{ color: "#666" }}>Action</span><span style={{ fontWeight: 600 }}>{label}</span></div>}
        {decodedSol && <div style={s.row}><span style={{ color: "#666" }}>Amount</span><span style={{ fontWeight: 700 }}>{decodedSol}</span></div>}
        <div style={s.row}><span style={{ color: "#666" }}>Policy</span><span style={{ fontFamily: "monospace", fontSize: "11px" }}>{intent.policyId}</span></div>
        <div style={s.row}><span style={{ color: "#666" }}>Program</span><span style={{ fontFamily: "monospace", fontSize: "11px" }}>{shortAddr(intent.targetProgramId)}</span></div>
        <div style={{ ...s.row, borderBottom: "none" }}><span style={{ color: "#666" }}>Accounts</span><span style={{ fontSize: "11px", color: "#888" }}>{intent.accountsCount} bound</span></div>
      </div>
      <button style={{ ...s.primary, opacity: busy ? 0.6 : 1 }} onClick={_resolveConfirmation} disabled={busy}>
        {busy ? "Opening device…" : "Approve with device →"}
      </button>
      <button style={s.ghost} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
    </Overlay>
  )
}

function ApprovalModal() {
  const { state, _resolveApproval, _rejectPending, config, registry } = useTranaContext()
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  if (state.phase !== "needs-approval" && state.phase !== "approving") return null
  const { intent } = state

  useEffect(() => {
    const tick = () => setCountdown(Math.max(0, intent.expiryUnix - Math.floor(Date.now() / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [intent.expiryUnix])

  useEscapeKey(() => _rejectPending("Cancelled"))

  const handleApprove = useCallback(async () => {
    if (!registry) { setError("Device not set up"); return }
    setBusy(true); setError(null)
    try {
      const challenge = hashIntent(intent)
      const result    = await doApproval(registry.credentialId, challenge, config.rpId)
      _resolveApproval(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed")
      setBusy(false)
    }
  }, [intent, config, registry, _resolveApproval])

  const expired = countdown === 0

  return (
    <Overlay onDismiss={() => _rejectPending("Cancelled")}>
      <Steps current={2} />
      <p style={s.label}>Approve</p>
      <h2 style={s.heading}>Confirm with your device</h2>
      <div style={{ marginBottom: "18px" }}>
        <div style={s.row}><span style={{ color: "#666" }}>Policy</span><span style={{ fontFamily: "monospace", fontSize: "11px" }}>{intent.policyId}</span></div>
        <div style={s.row}><span style={{ color: "#666" }}>Program</span><span style={{ fontFamily: "monospace", fontSize: "11px" }}>{shortAddr(intent.targetProgramId)}</span></div>
        <div style={{ ...s.row, borderBottom: "none" }}>
          <span style={{ color: "#666" }}>Expires in</span>
          <span style={{ color: countdown !== null && countdown < 30 ? "#ef4444" : "#16A34A" }}>
            {countdown !== null ? `${countdown}s` : "…"}
          </span>
        </div>
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "14px" }}>{error}</p>}
      <button style={{ ...s.primary, opacity: busy || expired ? 0.6 : 1 }} onClick={handleApprove} disabled={busy || expired}>
        {busy ? "Waiting…" : expired ? "Expired — try again" : "Approve with device"}
      </button>
      <button style={s.ghost} onClick={() => _rejectPending("Cancelled")}>Cancel</button>
    </Overlay>
  )
}

function ErrorModal() {
  const { state, _rejectPending } = useTranaContext()
  if (state.phase !== "error") return null

  const { text } = humanizeError(state.message)
  useEscapeKey(() => _rejectPending("Cancelled"))

  return (
    <Overlay onDismiss={() => _rejectPending("Cancelled")}>
      <p style={s.label}>Trana Guard</p>
      <h2 style={{ ...s.heading, color: "#ef4444" }}>Something went wrong</h2>
      <p style={s.body}>{text}</p>
      <button style={s.primary} onClick={() => _rejectPending("Cancelled")}>Close</button>
    </Overlay>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────

/**
 * Place <TranaModal /> anywhere inside <TranaProvider>. It renders the
 * appropriate modal (registration, confirmation, approval, error) as needed.
 */
export function TranaModal() {
  const { state } = useTranaContext()
  if (state.phase === "needs-registration" || state.phase === "registering") return <RegistrationModal />
  if (state.phase === "needs-confirmation" || state.phase === "confirming")  return <ConfirmationModal />
  if (state.phase === "needs-approval"     || state.phase === "approving")   return <ApprovalModal />
  if (state.phase === "error")                                               return <ErrorModal />
  return null
}
