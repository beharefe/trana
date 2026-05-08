import { ChevronRight } from "lucide-react"

const INSTRUCTIONS = [
  { slot: "ix[N-2]", name: "secp256r1",    sub: "P-256 verify"    },
  { slot: "ix[N-1]", name: "record_proof", sub: "trana_guard"      },
  { slot: "ix[N]",   name: "withdraw",     sub: "vault::withdraw"  },
] as const

type Props = {
  /** policy label shown in the badge — update per last tx */
  policy?: string
  /** which instruction is currently "active" (highlight on send) */
  activeIx?: number
}

export function TxAnatomyStrip({ policy = "Limit", activeIx }: Props) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card p-5 space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
          Last transaction
        </span>
        {/* badge — update text per tx result */}
        <span className="font-mono text-[10.5px] px-2.5 py-1 rounded-full border border-accent/25 text-accent tracking-[0.04em]">
          Policy · {policy}
        </span>
      </div>

      {/* instruction boxes */}
      <div className="flex items-center gap-2">
        {INSTRUCTIONS.map((ix, i) => {
          const isActive = activeIx === i
          return (
            <div key={ix.name} className="contents">
              <div
                className={[
                  "flex-1 px-3.5 py-3 rounded-lg border transition-colors",
                  isActive
                    ? "border-accent/30 bg-accent/[0.04]"
                    : "border-white/[0.10] bg-bg",
                ].join(" ")}
              >
                <div className="font-mono text-[10px] text-faint tracking-[0.06em] mb-1">{ix.slot}</div>
                <div className="font-mono text-[12.5px] font-medium text-ink">{ix.name}</div>
                <div className="font-mono text-[10.5px] text-muted mt-0.5">{ix.sub}</div>
              </div>
              {i < INSTRUCTIONS.length - 1 && (
                <ChevronRight size={14} className="text-faint shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* explainer — collapsed by default */}
      <details className="group">
        <summary className="font-mono text-[11px] text-faint tracking-[0.04em] cursor-pointer hover:text-muted transition-colors list-none flex items-center gap-1.5">
          <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
          Why three instructions?
        </summary>
        <p className="mt-2 text-[12.5px] text-muted leading-relaxed">
          Solana&apos;s secp256r1 verifier is a native precompile — not callable by CPI.{" "}
          <code className="font-mono text-[11.5px] text-ink">enforce()</code>{" "}
          reads sibling top-level instructions via the Instructions sysvar to confirm the proof.
        </p>
      </details>
    </div>
  )
}
