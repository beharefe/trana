"use client"

import React, { useCallback, useEffect, useState } from "react"
import { intentToPayloadHash } from "./intent"
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js"
import { useWallet } from "@solana/wallet-adapter-react"
import { useTranaContext } from "./provider"
import { doRegistration, doApproval } from "./webauthn"

// ── Inline styles (no Tailwind dependency from SDK) ───────────────────────────

const OVERLAY: React.CSSProperties = {
  position:        "fixed",
  inset:           0,
  background:      "rgba(0,0,0,0.6)",
  backdropFilter:  "blur(4px)",
  display:         "flex",
  alignItems:      "center",
  justifyContent:  "center",
  zIndex:          9999,
}

const CARD: React.CSSProperties = {
  background:    "#0f0f0f",
  border:        "1px solid #2a2a2a",
  borderRadius:  "16px",
  padding:       "32px",
  maxWidth:      "420px",
  width:         "90vw",
  color:         "#f5f5f5",
  fontFamily:    "system-ui, sans-serif",
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
  fontSize:   "14px",
  color:      "#999",
  lineHeight: 1.6,
  marginBottom: "24px",
}

const BTN_PRIMARY: React.CSSProperties = {
  width:         "100%",
  padding:       "12px 20px",
  background:    "#16A34A",
  color:         "#fff",
  border:        "none",
  borderRadius:  "10px",
  fontSize:      "14px",
  fontWeight:    600,
  cursor:        "pointer",
  transition:    "opacity 0.15s",
}

const BTN_GHOST: React.CSSProperties = {
  width:         "100%",
  padding:       "10px 20px",
  background:    "transparent",
  color:         "#666",
  border:        "none",
  borderRadius:  "10px",
  fontSize:      "13px",
  cursor:        "pointer",
  marginTop:     "8px",
}

const DETAIL_ROW: React.CSSProperties = {
  display:         "flex",
  justifyContent:  "space-between",
  fontSize:        "12px",
  padding:         "6px 0",
  borderBottom:    "1px solid #1a1a1a",
}

const REGISTER_DISCRIMINATOR = Buffer.from([
  0x63, 0xef, 0x62, 0x7d, 0x8a, 0x0c, 0x95, 0x4e,
])

// ── Register_two_fa instruction builder ──────────────────────────────────────

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

  const keyKindBuf = Buffer.from([0])  // 0 = Secp256r1Passkey

  const pkLenBuf = Buffer.allocUnsafe(4)
  pkLenBuf.writeUInt32LE(pubkey.length)

  const credLenBuf = Buffer.allocUnsafe(4)
  credLenBuf.writeUInt32LE(credentialId.length)

  const ixData = Buffer.concat([
    REGISTER_DISCRIMINATOR,
    keyKindBuf,
    pkLenBuf,
    Buffer.from(pubkey),
    credLenBuf,
    Buffer.from(credentialId),
  ])

  return new TransactionInstruction({
    programId: guardProgramId,
    keys: [
      { pubkey: registryPda,            isSigner: false, isWritable: true },
      { pubkey: walletPubkey,           isSigner: true,  isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") _rejectPending("Registration cancelled")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [_rejectPending])

  const handleRegister = useCallback(async () => {
    if (!publicKey || !signTransaction) return
    setStatus("working")
    setError(null)

    try {
      // Run WebAuthn registration ceremony — fully client-side, no backend
      const { credentialId, pubkey } = await doRegistration(config.rpId)

      // Build and submit register_two_fa instruction onchain
      const registerIx = buildRegisterIx(
        publicKey,
        config.guardProgramId,
        pubkey,
        credentialId
      )
      const { blockhash } = await connection.getLatestBlockhash("confirmed")
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
      tx.add(registerIx)

      const signed = await signTransaction(tx)
      const sig    = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, "confirmed")

      _resolveRegistration()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed"
      setError(msg)
      setStatus("error")
    }
  }, [publicKey, signTransaction, connection, config, _resolveRegistration])

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Registration cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <p style={LABEL}>Trana Guard</p>
        <h2 style={HEADING}>Passkey required</h2>
        <p style={BODY}>
          This action requires a second-factor passkey. Register one to continue.
          Your key is stored onchain — no backend holds it.
        </p>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
            {error}
          </p>
        )}

        <button
          style={{ ...BTN_PRIMARY, opacity: status === "working" ? 0.6 : 1 }}
          onClick={handleRegister}
          disabled={status === "working"}
        >
          {status === "working" ? "Setting up passkey..." : "Register passkey"}
        </button>
        <button
          style={BTN_GHOST}
          onClick={() => _rejectPending("Registration cancelled")}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Approval modal ────────────────────────────────────────────────────────────

function ApprovalModal() {
  const { state, _resolveApproval, _rejectPending, config, registry } = useTranaContext()
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle")
  const [error, setError]   = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  if (state.phase !== "needs-approval" && state.phase !== "approving") return null
  const intent = state.phase === "needs-approval" ? state.intent : state.intent

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const remaining = intent.expiryUnix - Math.floor(Date.now() / 1000)
      setCountdown(remaining > 0 ? remaining : 0)
    }
    updateCountdown()
    const id = setInterval(updateCountdown, 1000)
    return () => clearInterval(id)
  }, [intent.expiryUnix])

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") _rejectPending("Approval cancelled")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [_rejectPending])

  const handleApprove = useCallback(async () => {
    setStatus("working")
    setError(null)

    try {
      if (!registry) throw new Error("Registry not found")

      const payloadHash = intentToPayloadHash(intent)
      const result = await doApproval(registry.credentialId, payloadHash, config.rpId)

      _resolveApproval(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed"
      setError(msg)
      setStatus("error")
    }
  }, [intent, config, registry, _resolveApproval])

  const shortProgram = `${intent.guardProgramId.slice(0, 6)}...${intent.guardProgramId.slice(-4)}`

  return (
    <div style={OVERLAY} onClick={() => _rejectPending("Approval cancelled")}>
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <p style={LABEL}>Trana Guard · Approval required</p>
        <h2 style={HEADING}>Approve with passkey</h2>

        <div style={{ marginBottom: "20px" }}>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Action</span>
            <span style={{ fontWeight: 600 }}>{intent.policy}</span>
          </div>
          <div style={DETAIL_ROW}>
            <span style={{ color: "#666" }}>Program</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{shortProgram}</span>
          </div>
          <div style={{ ...DETAIL_ROW, border: "none" }}>
            <span style={{ color: "#666" }}>Expires in</span>
            <span style={{ color: countdown !== null && countdown < 30 ? "#ef4444" : "#16A34A" }}>
              {countdown !== null ? `${countdown}s` : "..."}
            </span>
          </div>
        </div>

        <p style={{ ...BODY, marginBottom: "20px", fontSize: "13px" }}>
          Your passkey will sign a cryptographic proof binding this exact action.
          Execution fails if the proof is absent or tampered with.
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
          {status === "working" ? "Waiting for passkey..." : "Approve with passkey"}
        </button>
        <button
          style={BTN_GHOST}
          onClick={() => _rejectPending("Approval cancelled")}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Combined modal entry point ────────────────────────────────────────────────

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
