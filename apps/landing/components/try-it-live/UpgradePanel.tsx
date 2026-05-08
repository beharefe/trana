"use client"

import { useState } from "react"
import { ShieldCheck, XCircle, KeyRound, Copy } from "lucide-react"

type UpgradeResult = "idle" | "blocked" | "approved"

export function UpgradePanel() {
  const [result, setResult] = useState<UpgradeResult>("idle")

  return (
    <div className="not-prose rounded-xl border border-white/[0.08] bg-card overflow-hidden">

      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
        <span className="font-mono text-[13px] font-medium text-ink">Program upgrade · authority PDA</span>
        <span className="font-mono text-[11px] text-faint">
          policy in play <span className="text-[#ff5b1f]">Require</span>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/[0.06]">

        {/* left */}
        <div className="p-5 bg-card space-y-5">
          {/* current authority */}
          <div>
            <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-2">Upgrade authority</div>
            <div className="px-3.5 py-2.5 rounded-lg border border-white/[0.08] bg-bg">
              <div className="font-mono text-[10px] text-faint mb-0.5">trana_authority PDA</div>
              {/* address → replace with real PDA */}
              <div className="font-mono text-[12px] text-ink">KoXv…vGEE</div>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Attack */}
            <button
              type="button"
              onClick={() => setResult("blocked")}
              className="w-full py-3 rounded-xl font-mono text-[12px] tracking-[0.06em] text-[#ff5b1f] border border-[#ff5b1f]/25 bg-[#ff5b1f]/[0.04] hover:bg-[#ff5b1f]/[0.08] transition-colors uppercase"
            >
              Upgrade with leaked wallet key
            </button>

            {/* Approve */}
            <button
              type="button"
              onClick={() => setResult("approved")}
              className="w-full py-3 rounded-xl font-mono font-semibold text-[12px] tracking-[0.08em] text-bg bg-accent hover:brightness-110 transition-all uppercase"
            >
              Upgrade with passkey
            </button>
          </div>

          <p className="font-mono text-[11px] text-faint leading-relaxed">
            The wallet key alone cannot upgrade this program. The upgrade authority has been transferred to the Trana Authority PDA.
          </p>
        </div>

        {/* right */}
        <div className="p-5 bg-card space-y-6">
          {/* result */}
          <div>
            <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-2">Last result</div>
            {result === "idle" &&
              <div className="flex items-center gap-1.5 font-mono text-[12px] text-faint"><KeyRound size={12} /> Awaiting attempt</div>}
            {result === "blocked" &&
              <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#ff5b1f]"><XCircle size={12} /> Incorrect authority provided</div>}
            {result === "approved" &&
              <div className="flex items-center gap-1.5 font-mono text-[12px] text-accent"><ShieldCheck size={12} /> ProofVerified — upgrade executed</div>}
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="space-y-3">
            <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase">What this proves</div>
            <div className="space-y-2">
              {[
                { label: "Wallet key alone",    result: "blocked",  desc: "BPF Loader rejects — not the authority" },
                { label: "Passkey approved",    result: "approved", desc: "execute_upgrade CPI succeeds" },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-white/[0.06] bg-bg">
                  <span className={`font-mono text-[10px] shrink-0 mt-0.5 ${r.result === "blocked" ? "text-[#ff5b1f]" : "text-accent"}`}>
                    {r.result === "blocked" ? "✗" : "✓"}
                  </span>
                  <div>
                    <div className="font-mono text-[11px] text-ink">{r.label}</div>
                    <div className="font-mono text-[10px] text-faint mt-0.5">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Program state ── */}
      <div className="border-t border-white/[0.06] p-5 space-y-5">

        {/* section label */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.16em] text-faint uppercase">Program state</span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[9px] tracking-[0.10em] text-accent uppercase">Live</span>
        </div>

        {/* ids */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase mb-1.5">Program ID</div>
            {/* replace with real program ID */}
            <div className="font-mono text-[12px] text-ink">8v6hfEZ3…yxtaa</div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase mb-1.5">Upgrade Auth</div>
            {/* replace with real PDA */}
            <div className="font-mono text-[12px] text-ink">KoXvrg4D…vGEE</div>
            <div className="font-mono text-[9px] text-accent tracking-[0.06em] uppercase mt-1">Trana Authority PDA</div>
          </div>
        </div>

        {/* solana program show terminal */}
        <div className="rounded-xl border border-white/[0.08] bg-bg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <span className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase">
              Solana program show
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(
                "solana program show 8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa --url devnet"
              )}
              className="flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] text-faint hover:text-ink transition-colors uppercase"
            >
              <Copy size={10} />
              Copy
            </button>
          </div>
          <pre className="px-4 py-3.5 font-mono text-[11.5px] leading-[1.85] overflow-x-auto">
            <span className="text-faint">{"$ solana program show 8v6hfEZ3…yxtaa\n"}</span>
            <span className="text-ink">{"Program Id:   "}</span><span className="text-accent">{"8v6hfEZ3…yxtaa\n"}</span>
            <span className="text-ink">{"Owner:        "}</span><span className="text-muted">{"BPFLoaderUpgradeab1e\n"}</span>
            <span className="text-ink">{"Authority:    "}</span><span className="text-accent">{"KoXvrg4D…vGEE"}</span><span className="text-faint">{"  ← Trana PDA, not a wallet\n"}</span>
            <span className="text-ink">{"Last Slot:    "}</span><span className="text-muted">{"327,891,204\n"}</span>
            <span className="text-ink">{"Data Length:  "}</span><span className="text-muted">{"286,456 bytes"}</span>
          </pre>
        </div>

        {/* version */}
        <div className="flex items-center gap-3">
          <div>
            <div className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase mb-1.5">Version</div>
            {/* update after upgrade tx */}
            <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-white/[0.12] font-mono text-[11px] text-ink">
              v1
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
