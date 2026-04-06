"use client"

/**
 * /approve — WebAuthn approval page (redirect-based flow)
 *
 * This page is the UX helper for passkey approvals. It:
 *   1. Parses the payload from the URL query param
 *   2. Runs the WebAuthn get() ceremony (biometric / PIN prompt)
 *   3. Extracts the P-256 signature from the assertion
 *   4. Redirects back to the caller with the signature in URL params
 *
 * SECURITY: This page is NOT a trust anchor.
 *   - It does NOT sign anything with a server key.
 *   - It does NOT store private keys.
 *   - It only runs the WebAuthn ceremony and passes the raw signature back.
 *   - The calling app builds the secp256r1 precompile instruction.
 *   - The onchain program verifies everything.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import type { TranaPayload } from "@trana-guard/sdk"
import { sha256 } from "@trana-guard/sdk"

type Stage = "parsing" | "prompting" | "redirecting" | "error"

export default function ApprovePage() {
  const params = useSearchParams()

  const [stage, setStage] = useState<Stage>("parsing")
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<TranaPayload | null>(null)

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    try {
      // ── Parse payload from URL ────────────────────────────────────────────
      const rawPayload  = params.get("payload")
      const redirectUrl = params.get("redirect")

      if (!rawPayload || !redirectUrl) {
        throw new Error("Missing payload or redirect param")
      }

      const decoded = JSON.parse(
        Buffer.from(rawPayload, "base64url").toString("utf8")
      ) as TranaPayload

      if (decoded.domain !== "trana.solana") {
        throw new Error("Invalid payload domain")
      }

      setPayload(decoded)

      // ── Compute the payload hash (what the passkey will sign) ─────────────
      const payloadJson = JSON.stringify({
        domain:     decoded.domain,
        userPubkey: decoded.userPubkey,
        programId:  decoded.programId,
        policy:     decoded.policy,
        nonce:      decoded.nonce,
        expiry:     decoded.expiry,
      })
      const payloadHash    = sha256(payloadJson)
      const payloadHashHex = Buffer.from(payloadHash).toString("hex")

      // ── Fetch WebAuthn authentication options ─────────────────────────────
      // The challenge = payloadHashHex so the authenticator's signature is
      // cryptographically bound to this exact payload.
      setStage("prompting")

      const serverUrl = typeof window !== "undefined" ? window.location.origin : ""
      const optionsRes = await fetch(`${serverUrl}/api/approve/options`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          payloadHash: payloadHashHex,
          wallet:      decoded.userPubkey,
        }),
      }).then(r => r.json()) as { options: unknown; error?: string }

      if (optionsRes.error) throw new Error(optionsRes.error)

      // ── Run WebAuthn authentication ceremony ──────────────────────────────
      const assertion = await startAuthentication({
        optionsJSON: optionsRes.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      })

      // ── Send assertion to backend for verification ────────────────────────
      // The backend verifies the WebAuthn assertion (RP ID, origin, counter)
      // for UX safety, and returns the raw P-256 signature + authenticator data
      // so the client can build the secp256r1 precompile instruction.
      const verifyRes = await fetch(`${serverUrl}/api/approve/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ assertion, payloadHash: payloadHashHex }),
      }).then(r => r.json()) as {
        verified:          boolean
        p256Signature?:    string   // base64: 64-byte compact P-256 sig
        authenticatorData?: string  // base64: authenticatorData bytes
        error?: string
      }

      if (!verifyRes.verified || !verifyRes.p256Signature) {
        throw new Error(verifyRes.error ?? "WebAuthn verification failed")
      }

      // ── Redirect back with proof data ─────────────────────────────────────
      // The calling app receives the raw P-256 signature and builds the
      // secp256r1 precompile instruction itself.
      setStage("redirecting")

      const returnUrl = new URL(decodeURIComponent(redirectUrl))
      returnUrl.searchParams.set("status", "approved")
      returnUrl.searchParams.set("sig",  verifyRes.p256Signature)
      returnUrl.searchParams.set("hash", Buffer.from(payloadHash).toString("base64url"))
      if (verifyRes.authenticatorData) {
        returnUrl.searchParams.set("authData", verifyRes.authenticatorData)
      }

      window.location.href = returnUrl.toString()

    } catch (err: unknown) {
      console.error("[approve]", err)
      setError(err instanceof Error ? err.message : "Approval failed")
      setStage("error")

      // Redirect back with error so the caller can handle it gracefully.
      const redirectUrl = params.get("redirect")
      if (redirectUrl) {
        setTimeout(() => {
          const returnUrl = new URL(decodeURIComponent(redirectUrl))
          returnUrl.searchParams.set("status", "rejected")
          returnUrl.searchParams.set("error",  err instanceof Error ? err.message : "rejected")
          window.location.href = returnUrl.toString()
        }, 2000)
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-mono flex items-center justify-center">
      <div className="max-w-sm w-full mx-auto px-6 space-y-6 text-center">

        <div>
          <h1 className="text-lg font-bold text-green-400">
            {stage === "error" ? "Approval failed" : "Passkey approval"}
          </h1>
        </div>

        {stage === "parsing" && (
          <p className="text-sm text-gray-400">Verifying request...</p>
        )}

        {stage === "prompting" && payload && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Your passkey is required to authorize this action.
            </p>
            <div className="border border-gray-800 rounded-lg p-4 text-left space-y-2 text-xs text-gray-400">
              <div className="flex justify-between">
                <span>Policy</span>
                <span className="text-gray-200 font-medium">{payload.policy}</span>
              </div>
              <div className="flex justify-between">
                <span>Program</span>
                <span className="text-gray-200 font-mono">
                  {payload.programId.slice(0, 8)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span>Expires</span>
                <span className="text-gray-200">
                  {new Date(payload.expiry * 1000).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Use Touch ID, Face ID, or your security key when prompted.
            </p>
          </div>
        )}

        {stage === "redirecting" && (
          <p className="text-sm text-green-400">Approved. Returning to app...</p>
        )}

        {stage === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-gray-500">Redirecting back to app...</p>
          </div>
        )}

        <p className="text-xs text-gray-700 border-t border-gray-900 pt-4">
          This page runs the WebAuthn ceremony only.
          No private keys are stored or transmitted.
          The signature is verified onchain by the Trana program.
        </p>

      </div>
    </main>
  )
}
