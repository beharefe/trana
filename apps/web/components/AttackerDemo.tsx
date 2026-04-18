"use client"

import type { VaultStatusResponse } from "@trana-guard/sdk"

interface Props {
  vault: VaultStatusResponse | null
}

export function AttackerDemo({ vault }: Props) {
  return (
    <section className="border border-red-900/40 rounded-lg p-5 bg-red-950/10">
      <h2 className="text-xs font-semibold text-red-400/70 uppercase tracking-widest mb-3">
        Attacker demo
      </h2>
      {vault ? (
        <p className="text-xs text-gray-500">
          Vault balance: <span className="text-gray-300">{vault.balance_sol} SOL</span>
        </p>
      ) : (
        <p className="text-xs text-gray-600 italic">AttackerDemo — coming soon</p>
      )}
    </section>
  )
}
