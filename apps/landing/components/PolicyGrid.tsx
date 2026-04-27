"use client"

import Link from "next/link"
import { GridBg } from "./Hero"

const POLICIES: { name: string; desc: string; color: string }[] = [
  { name: "Require",   desc: "unconditional passkey gate",     color: "#7aa8ff" },
  { name: "Limit",     desc: "per-tx amount threshold",        color: "#ff7a59" },
  { name: "NotBefore", desc: "gate until slot N",              color: "#f3d77a" },
  { name: "NotAfter",  desc: "gate after slot N",              color: "#f3d77a" },
]

export function PolicyGrid() {
  return (
    <section
      id="policies"
      className="relative min-h-screen px-6 sm:px-12 pt-[120px] pb-[140px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto grid grid-rows-[auto_auto] gap-0">
        {/* Header */}
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-faint tracking-[0.08em] uppercase px-2.5 py-[5px] border border-white/[0.08] rounded-full bg-white/[0.015]">
            <span className="w-[7px] h-[7px] rounded-[2px] bg-ink shrink-0" />
            4 policies · one CPI
          </span>
          <h2 className="font-serif text-[clamp(42px,6.4vw,88px)] leading-[0.98] tracking-[-0.035em] mt-6 mb-[18px] max-w-[18ch] text-balance text-ink">
            Start protecting.
          </h2>
          <p className="text-[clamp(17px,1.5vw,21px)] text-muted leading-[1.45] max-w-[52ch] tracking-[-0.005em]">
            The condition lives in our code, not yours. Trana reads instruction
            data and the clock directly, so a compromised caller cannot skip
            the check. One CPI call.
          </p>
        </div>

        {/* Grid */}
        <div
          className="mt-10 grid grid-cols-2 gap-px rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {POLICIES.map((p) => (
            <Link
              key={p.name}
              href="/docs/quickstart"
              className="group flex items-center gap-3 px-[18px] py-4 bg-bg hover:bg-card transition-colors"
            >
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: p.color, boxShadow: `0 0 8px ${p.color}66` }}
              />
              <span className="flex-1 text-[15px] font-medium tracking-[-0.01em] text-ink leading-none">
                {p.name}
              </span>
              <span className="text-faint font-mono text-[13px] group-hover:text-ink group-hover:translate-x-0.5 transition-all">
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
