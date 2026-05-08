"use client"

import { TranaWordmark } from "@/components/Logo"

/** Top-of-page vault stats bar — 3 column: brand | balance | wallet */
export function VaultBanner() {
  return (
    <div className="not-prose -mx-6 sm:-mx-8 mb-8 px-6 sm:px-8 py-4 border-b border-white/[0.08] bg-card grid grid-cols-[auto_1fr_auto] items-center gap-4">

      {/* ── Left: brand + badges ── */}
      <div className="flex items-center gap-2.5">
        <TranaWordmark size="18px" />
        <span className="px-2 py-0.5 rounded border border-white/[0.14] font-mono text-[9px] tracking-[0.14em] text-faint uppercase">
          guard
        </span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#ff5b1f]/35 bg-[#ff5b1f]/[0.07] font-mono text-[9px] tracking-[0.10em] text-[#ff5b1f] uppercase">
          <span className="w-1 h-1 rounded-full bg-[#ff5b1f]" />
          devnet
        </span>
      </div>

      {/* ── Center: vault balance ── */}
      <div className="text-center">
        <div className="font-mono text-[9px] tracking-[0.18em] text-faint uppercase mb-0.5">
          Shared vault balance
        </div>
        {/* value → replace with live RPC */}
        <div className="font-sans font-semibold text-[22px] sm:text-[28px] tracking-[-0.03em] text-ink leading-none">
          — <span className="text-[14px] font-normal text-faint tracking-normal">SOL</span>
        </div>
      </div>

      {/* ── Right: wallet ── */}
      {/* connected state → replace outer div content via state */}
      <div className="flex items-center gap-2.5">
        {/* NOT connected → show button */}
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-white/[0.14] font-mono text-[11px] tracking-[0.04em] text-ink hover:bg-white/[0.04] transition-colors whitespace-nowrap"
        >
          Connect wallet
        </button>

        {/* CONNECTED state (hidden by default, show via state):
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.10] bg-bg">
          <span className="font-mono text-[11px] text-faint">Phantom</span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[11px] text-ink">AaBb_BMSS</span>
          <span className="font-mono text-[11px] text-faint">4.38 SOL</span>
        </div>
        */}
      </div>
    </div>
  )
}
