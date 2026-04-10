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

const LABEL: React.CSSProperties = {
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
  fontSize:       "12px",
  padding:        "6px 0",
  borderBottom:   "1px solid #1a1a1a",
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
  pkLenBuf.writeUInt32LE(pubkey.length)
  const credLenBuf = Buffer.allocUnsafe(4)
  credLenBuf.writeUInt32LE(credentialId.length)

  const ixData = Buffer.concat([
    REGISTER_DISCRIMINATOR,
    Buffer.from([0]),        // key_kind = 0 (Secp256r1Passkey)
    pkLenBuf,
    Buffer.from(pubkey),
    credLenBuf,
    Buffer.from(credentialId),
  ])

  return new TransactionInstruction({
    programId: guardProgramId,
    keys: [
      { pubkey: registryPda,              isSigner: false, isWritable: true  },
      { pubkey: walletPubkey,             isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
    ],
    data: ixData,
  })
}

// ── Registration modal ────────────────────────────────────────────────────────

function RegistrationModal() {
  const { _resolveRegistration, _rejectPending, config, connection } = useTranaContext()
  const { publicKey, signTransaction } = useWallet()
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle")
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") _rejectPending("Cancelled")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [_rejectPending])

  const handleSetup = useCallback(async () => {
    if (!publicKey || !signTransaction) return
    setStatus("working")
    setError(null)

    try {
      // WebAuthn registration — fully client-side, no backend
      const { credentialId, pubkey } = await doRegistration(config.rpId)

      // Build and send register_two_fa onchain
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
        <p style={LABEL}>Trana Guard</p>
        <h2 style={HEADING}>Secure approval required</h2>
        <p style={BODY}>
          This action requires device approval before it can execute.
          Set up once — future approvals are instant from this device.
        </p>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
            {error}
          </p>
        )}

        <button
          style={{ ...BTN_PRIMARY, opacity: status === "working" ? 0.6 : 1 }}
          onClick={handleSetup}
          disabled={status === "working"}
        >
          {status === "working" ? "Setting up…" : "Set up device approval"}
        </button>
        <button style={BTN_GHOST} onClick={() => _rejectPending("Cancelled")}>
          Cancel
        </button>
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

  // Countdown to expiry
  useEffect(() => {
    const tick = () => {
      const remaining = intent.expiryUnix - Math.floor(Date.now() / 1000)
      setCountdown(remaining > 0 ? remaining : 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [intent.expiryUnix])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") _rejectPending("Cancelled")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [_rejectPending])

  const handleApprove = useCallback(async () => {
    if (!registry) { setError("Device not set up"); return }
    setStatus("working")
    setError(null)

    try {
      // Challenge = hashIntent(intent) — cryptographically binds the device
      // signature to this exact action (program, accounts, params, nonce, expiry).
      // Replay is prevented: nonce + expiry + exact binding = each approval is unique.
      const challenge = hashIntent(intent)
      const result    = await doApproval(registry.credentialId, challenge, config.rpId)
      _resolveApproval(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approval failed")
      setStatus("error")
    }
  }, [intent, config, registry, _resolveApproval])

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <p style={LABEL}>Trana Guard · Confirmation required</p>
        <h2 style={HEADING}>Approve this action</h2>

        <div style={{ marginBottom: "20px" }}>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Action</span>
            <span style={{ fontWeight: 600 }}>{intent.policyId}</span>
          </div>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Program</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
              {shortAddr(intent.targetProgramId)}
            </span>
          </div>
          <div style={{ ...DETAIL_ROW, border: "none" }}>
            <span style={{ color: "#666" }}>Expires in</span>
            <span style={{ color: countdown !== null && countdown < 30 ? "#ef4444" : "#16A34A" }}>
              {countdown !== null ? `${countdown}s` : "…"}
            </span>
          </div>
        </div>

        <p style={{ ...BODY, marginBottom: "20px", fontSize: "13px" }}>
          Confirm with your device. You&apos;ll then confirm the final
          transaction in your wallet — one signature, one send.
        </p>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
            {error}
          </p>
        )}

        <button
          style={{ ...BTN_PRIMARY, opacity: status === "working" ? 0.6 : 1 }}
          onClick={handleApprove}
          disabled={status === "working" || countdown === 0}
        >
          {status === "working" ? "Waiting for device…" : "Approve with device"}
        </button>
        <button style={BTN_GHOST} onClick={() => _rejectPending("Cancelled")}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Combined modal entry point ────────────────────────────────────────────────

/**
 * Place <TranaModal /> anywhere inside <TranaProvider> to render the
 * registration and approval modals when they are needed.
 *
 *   <TranaProvider config={...}>
 *     <App />
 *     <TranaModal />
 *   </TranaProvider>
 */
export function TranaModal() {
  const { state } = useTranaContext()

  if (state.phase === "needs-registration" || state.phase === "registering") {
    return <RegistrationModal />
  }
  if (state.phase === "needs-approval" || state.phase === "approving") {
    return <ApprovalModal />
  }
  return null
}
