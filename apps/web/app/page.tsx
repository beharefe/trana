"use client"

import { useState, useCallback } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { PasskeyStatus } from "@/components/PasskeyStatus"
import { TransferForm } from "@/components/TransferForm"

export default function Home() {
  const { publicKey } = useWallet()
  const wallet = publicKey?.toBase58() ?? null

  const [refreshKey, setRefreshKey] = useState(0)
  const handleStatusRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-indigo-400">Trana</span>
            <span className="text-gray-300"> Guard</span>
          </h1>
          <p className="text-xs text-gray-500">
            Transaction Authorization Guard — Solana devnet POC
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* Concept */}
        <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/30">
          <h2 className="text-sm font-bold text-gray-300 mb-2">How it works</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Transactions fail onchain unless a valid passkey proof is included.
            Even if a wallet signs, the Anchor program rejects execution without
            the second factor.
          </p>
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <div>
              <span className="text-indigo-400">Passkey →</span> proves approval to the bridge
            </div>
            <div>
              <span className="text-indigo-400">Bridge →</span> proves approval to the chain
            </div>
          </div>
        </section>

        {/* Policy */}
        <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/30">
          <h2 className="text-sm font-bold text-gray-300 mb-3">Built-in policy</h2>
          <pre className="text-xs text-indigo-300 bg-black/40 rounded p-3">
{`Any([
  HighValueTransfer { threshold: 20 SOL },
  UserOptIn
])`}
          </pre>
        </section>

        {/* Wallet + Passkey status */}
        {wallet ? (
          <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/30 space-y-3">
            <h2 className="text-sm font-bold text-gray-300">Connected wallet</h2>
            <p className="text-xs text-gray-500 break-all">{wallet}</p>
            <PasskeyStatus key={refreshKey} wallet={wallet} />
          </section>
        ) : (
          <section className="border border-dashed border-gray-700 rounded-lg p-8 text-center text-gray-500 text-sm">
            Connect your Phantom wallet to get started
          </section>
        )}

        {/* Transfer form */}
        {wallet && (
          <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/30">
            <h2 className="text-sm font-bold text-gray-300 mb-4">Protected transfer</h2>
            <TransferForm onStatusRefresh={handleStatusRefresh} />
          </section>
        )}

        {/* Demo scenarios */}
        <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/30">
          <h2 className="text-sm font-bold text-gray-300 mb-3">Demo scenarios</h2>
          <table className="w-full text-xs text-gray-400">
            <thead>
              <tr className="text-left border-b border-gray-800">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Setup</th>
                <th className="pb-2">Expected</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              {[
                ["1", "10 SOL (below threshold)", "✅ Success — no passkey needed"],
                ["2", "30 SOL, no passkey registered", "❌ Fail: MissingProof"],
                ["3", "30 SOL + passkey approved", "✅ Success"],
                ["4", "Replay nonce from #3", "❌ Fail: NonceAlreadyUsed"],
                ["5", "Modify amount after proof", "❌ Fail: PayloadMismatch"],
              ].map(([num, setup, expected]) => (
                <tr key={num} className="border-b border-gray-800/50">
                  <td className="py-2 pr-4 text-gray-600">{num}</td>
                  <td className="py-2 pr-4">{setup}</td>
                  <td className="py-2">{expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
