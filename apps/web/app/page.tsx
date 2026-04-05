"use client"

import { useCallback, useEffect, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { PasskeyStatus } from "@/components/PasskeyStatus"
import { VaultPanel } from "@/components/VaultPanel"
import { AttackerDemo } from "@/components/AttackerDemo"
import { TxFeed, type TxEntry } from "@/components/TxFeed"
import type { VaultStatusResponse } from "@trana-guard/sdk"

let _nextId = 0

export default function Home() {
  const { publicKey }  = useWallet()
  const wallet         = publicKey?.toBase58() ?? null
  const serverUrl      = typeof window !== "undefined" ? window.location.origin : ""

  const [vault,    setVault]    = useState<VaultStatusResponse | null>(null)
  const [feed,     setFeed]     = useState<TxEntry[]>([])

  const refreshVault = useCallback(async () => {
    if (!wallet) { setVault(null); return }
    const r = await fetch(`/api/vault?wallet=${encodeURIComponent(wallet)}`)
    if (r.ok) setVault(await r.json())
  }, [wallet])

  useEffect(() => { refreshVault() }, [refreshVault])

  function pushFeed(ok: boolean, label: string, sig?: string) {
    setFeed((prev) => [
      { id: String(_nextId++), ok, label, sig, ts: Date.now() },
      ...prev.slice(0, 9),
    ])
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-mono">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-indigo-400">Trana</span>
              <span className="text-gray-200"> Guard</span>
              <span className="ml-2 text-xs text-gray-600 font-normal">devnet POC</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              Onchain authorization primitive — execution-time second-factor enforcement
            </p>
          </div>
          <div className="flex items-center gap-3">
            {wallet && <PasskeyStatus wallet={wallet} serverUrl={serverUrl} />}
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="border border-gray-800 rounded-lg p-6 bg-gray-900/20">
          <div className="max-w-2xl">
            <p className="text-xs text-indigo-400 uppercase tracking-widest mb-3 font-semibold">
              Core guarantee
            </p>
            <blockquote className="text-lg text-gray-200 leading-relaxed font-medium border-l-2 border-indigo-500 pl-4">
              "This instruction cannot execute unless a valid second-factor
              authorization proof is present in the same transaction."
            </blockquote>
            <p className="mt-4 text-sm text-gray-500">
              Enforced onchain. Cannot be bypassed by crafting raw transactions.
              Atomic with execution — proof and action succeed or fail together.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            {[
              ["Wallet warning / simulation", "UI only", "Yes — bypass raw tx"],
              ["Multisig", "Signer composition", "No — operational overhead"],
              ["TAG (this)", "Onchain at execution", "No — enforced by program"],
            ].map(([mechanism, enforcement, bypassable], i) => (
              <div
                key={i}
                className={`p-3 rounded border text-xs ${
                  i === 2
                    ? "border-indigo-700 bg-indigo-950/30"
                    : "border-gray-800 bg-gray-900/30"
                }`}
              >
                <div className={`font-semibold mb-1.5 ${i === 2 ? "text-indigo-300" : "text-gray-300"}`}>
                  {mechanism}
                </div>
                <div className="text-gray-500 mb-1">{enforcement}</div>
                <div className={i === 2 ? "text-green-400" : "text-red-400/70"}>
                  {i === 2 ? "✅ " : "⚠️ "}
                  {bypassable}
                </div>
              </div>
            ))}
          </div>
        </section>

        {!wallet ? (
          /* ── Not connected ─────────────────────────────────────────────── */
          <section className="border border-dashed border-gray-700 rounded-lg p-12 text-center space-y-3">
            <p className="text-gray-400">Connect your Phantom wallet to run the demo</p>
            <WalletMultiButton />
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Left column ──────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* Trust model */}
              <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Trust model
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3 text-gray-400">
                    <span className="w-5 h-5 flex items-center justify-center bg-indigo-900/40 border border-indigo-800 rounded text-indigo-300 text-xs font-bold">1</span>
                    <span>User authenticates with passkey (WebAuthn)</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400">
                    <span className="w-5 h-5 flex items-center justify-center bg-indigo-900/40 border border-indigo-800 rounded text-indigo-300 text-xs font-bold">2</span>
                    <span>Bridge verifies assertion, signs payload hash</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400">
                    <span className="w-5 h-5 flex items-center justify-center bg-indigo-900/40 border border-indigo-800 rounded text-indigo-300 text-xs font-bold">3</span>
                    <span>Program verifies Ed25519 proof via Instructions sysvar</span>
                  </div>
                  <div className="mt-3 p-3 bg-black/30 rounded border border-gray-800 text-xs text-gray-500 italic">
                    Passkey proves approval to the bridge.<br />
                    Bridge proves approval to the chain.
                  </div>
                </div>
              </section>

              {/* Policy */}
              <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Built-in policy
                </h2>
                <pre className="text-xs text-indigo-300 bg-black/30 rounded p-3 leading-relaxed">{`Any([
  HighValueTransfer { threshold: 20 SOL },
  UserOptIn
])`}</pre>
                <p className="text-xs text-gray-600 mt-2">
                  Same rule tree evaluated client-side (for UX) and onchain (for enforcement).
                </p>
              </section>

              {/* Vault */}
              <VaultPanel
                onTxSuccess={(sig, label) => { pushFeed(true, label, sig); refreshVault() }}
                onTxError={(_, label)    => { pushFeed(false, label);      refreshVault() }}
              />

            </div>

            {/* ── Right column ─────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* Attacker demo */}
              <AttackerDemo vault={vault} />

              {/* Demo scenarios */}
              <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Demo scenarios
                </h2>
                <div className="space-y-2">
                  {[
                    { n: "1", setup: "Attacker has key — sends withdrawal, no proof",        expected: "❌ MissingProof",      ok: false },
                    { n: "2", setup: "Legit user — ≥20 SOL withdrawal + passkey approval",  expected: "✅ Success",           ok: true  },
                    { n: "3", setup: "Small withdrawal — below threshold, no opt-in",        expected: "✅ Success (no 2FA)", ok: true  },
                    { n: "4", setup: "Replay the nonce from scenario 2",                     expected: "❌ InvalidNonce",      ok: false },
                    { n: "5", setup: "Modify amount after proof issued",                     expected: "❌ PayloadMismatch",   ok: false },
                  ].map((s) => (
                    <div key={s.n} className="flex items-start gap-3 text-xs border-b border-gray-800/40 pb-2 last:border-0 last:pb-0">
                      <span className="text-gray-600 w-4 shrink-0">{s.n}.</span>
                      <span className="text-gray-400 flex-1">{s.setup}</span>
                      <span className={`shrink-0 ${s.ok ? "text-green-400" : "text-red-400"}`}>
                        {s.expected}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Tx feed */}
              {feed.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                    Activity
                  </h2>
                  <TxFeed entries={feed} />
                </section>
              )}

              {/* Use cases */}
              <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Target use cases
                </h2>
                <div className="space-y-1.5 text-xs text-gray-500">
                  {[
                    "DAO treasury disbursements",
                    "Protocol admin / upgrade authority",
                    "Vault withdrawals",
                    "High-value SOL / token transfers",
                    "Custodial / fintech withdrawal flows",
                  ].map((uc) => (
                    <div key={uc} className="flex gap-2">
                      <span className="text-indigo-600">→</span>
                      <span>{uc}</span>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          </div>
        )}
      </div>
    </main>
  )
}
