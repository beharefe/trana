import { Lock, Eye } from "lucide-react"

export function SeedPhraseBanner() {
  return (
    <div className="not-prose flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-white/[0.08] bg-card mb-6">
      <div className="flex items-center gap-2.5 text-faint text-[13px]">
        <Lock size={13} className="shrink-0" />
        <span>
          Seed phrase published. The funds are protected by passkey — not the key.
        </span>
      </div>
      {/* onClick → reveal seed phrase modal */}
      <button
        type="button"
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.14] font-mono text-[10px] tracking-[0.08em] text-ink uppercase hover:bg-white/[0.04] transition-colors"
      >
        <Eye size={11} />
        Show phrase
      </button>
    </div>
  )
}
