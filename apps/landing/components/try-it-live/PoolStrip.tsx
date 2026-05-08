import { Wifi } from "lucide-react"

export function PoolStrip() {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 rounded-xl border border-white/[0.08] bg-card">
      <div className="flex items-center gap-4">
        {/* devnet badge */}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-accent/25 bg-accent/[0.06] font-mono text-[11px] tracking-[0.06em] text-accent uppercase">
          <Wifi size={10} />
          devnet
        </span>

        {/* pool balance — replace span content with live RPC value */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-faint tracking-[0.06em] uppercase">Pool</span>
          <span className="font-mono text-[15px] font-medium text-ink">— SOL</span>
        </div>
      </div>

      {/* wallet connect — wire up adapter */}
      <button
        type="button"
        className="px-4 py-2 rounded-lg border border-white/[0.14] text-[13px] font-medium text-ink hover:bg-white/[0.04] transition-colors"
      >
        Connect wallet
      </button>
    </div>
  )
}
