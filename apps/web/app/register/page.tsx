"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { startPasskeyRegistration } from "@trana-guard/sdk"

type Stage = "idle" | "signing" | "webauthn" | "done" | "error"

export default function RegisterPage() {
  const { publicKey, signMessage } = useWallet()
  const router = useRouter()
  const params = useSearchParams()

  const walletParam = params.get("wallet")
  const wallet = publicKey?.toBase58() ?? null
  const serverUrl = typeof window !== "undefined" ? window.location.origin : ""

  const [stage, setStage] = useState<Stage>("idle")
  const [error, setError] = useState<string | null>(null)

  // Auto-start if wallet is already connected and matches param
  useEffect(() => {
    if (wallet && walletParam && wallet === walletParam && stage === "idle") {
      handleRegister()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, walletParam])

  async function handleRegister() {
    if (!wallet || !signMessage) return
    setError(null)
    setStage("signing")

    try {
      // Step 1: sign a message to prove wallet ownership (anti-spam)
      const msg = new TextEncoder().encode(
        `Register passkey for Trana Guard\nWallet: ${wallet}\nTimestamp: ${Date.now()}`
      )
      await signMessage(msg)

      // Step 2: WebAuthn registration ceremony
      setStage("webauthn")
      await startPasskeyRegistration(wallet, serverUrl)

      setStage("done")
      setTimeout(() => router.push("/"), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed")
      setStage("error")
    }
  }

  const stageLabel: Record<Stage, string> = {
    idle: "Register passkey",
    signing: "Sign wallet message to verify ownership…",
    webauthn: "Complete passkey setup in your browser…",
    done: "Passkey registered! Redirecting…",
    error: "Registration failed",
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-mono flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-indigo-400">Register passkey</h1>
          <p className="text-xs text-gray-500 mt-1">
            Link a passkey to your wallet. Stored offchain — the chain never
            sees your passkey credentials.
          </p>
        </div>

        {!wallet ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Connect your wallet first.</p>
            <WalletMultiButton />
          </div>
        ) : (
          <div className="border border-gray-800 rounded-lg p-5 bg-gray-900/30 space-y-4">
            <p className="text-xs text-gray-400 break-all">
              Wallet: <span className="text-gray-300">{wallet}</span>
            </p>

            <div
              className={`text-sm py-2 px-3 rounded ${
                stage === "done"
                  ? "bg-green-900/30 text-green-400"
                  : stage === "error"
                  ? "bg-red-900/30 text-red-400"
                  : "text-gray-400"
              }`}
            >
              {stageLabel[stage]}
            </div>

            {error && (
              <pre className="text-xs text-red-400 whitespace-pre-wrap break-all">
                {error}
              </pre>
            )}

            {(stage === "idle" || stage === "error") && (
              <button
                onClick={handleRegister}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2.5 text-sm font-mono transition-colors"
              >
                {stage === "error" ? "Try again" : "Register passkey"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
