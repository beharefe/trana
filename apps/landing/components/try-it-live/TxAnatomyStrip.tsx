import { ChevronRight, ChevronDown } from "lucide-react"

const INSTRUCTIONS = [
  { slot: "ix[N-2]", name: "secp256r1",    sub: "P-256 verify"   },
  { slot: "ix[N-1]", name: "record_proof", sub: "trana_guard"     },
  { slot: "ix[N]",   name: "withdraw",     sub: "vault::withdraw" },
] as const

type Props = {
  policy?:   string
  activeIx?: number
}

function IxBox({ ix, active }: { ix: typeof INSTRUCTIONS[number]; active: boolean }) {
  return (
    <div
      className={[
        "flex-1 min-w-0 px-3.5 py-3 rounded-lg border transition-colors",
        active ? "border-accent/30 bg-accent/[0.04]" : "border-white/[0.10] bg-bg",
      ].join(" ")}
    >
      <div className="font-mono text-[10px] text-faint tracking-[0.06em] mb-1">{ix.slot}</div>
      <div className="font-mono text-[13px] font-medium text-ink">{ix.name}</div>
      <div className="font-mono text-[10.5px] text-muted mt-0.5">{ix.sub}</div>
    </div>
  )
}

export function TxAnatomyStrip({ policy = "Limit", activeIx }: Props) {
  return (
    <div className="not-prose rounded-xl border border-white/[0.08] bg-card p-5 space-y-4">

      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
          Last transaction
        </span>
        <span className="font-mono text-[10.5px] px-2.5 py-1 rounded-full border border-accent/25 text-accent tracking-[0.04em]">
          Policy · {policy}
        </span>
      </div>

      {/* ── Instruction boxes — 3 layouts ── */}

      {/* lg: single row, horizontal arrows */}
      <div className="hidden lg:flex items-stretch gap-2">
        {INSTRUCTIONS.map((ix, i) => (
          <div key={ix.name} className="contents">
            <IxBox ix={ix} active={activeIx === i} />
            {i < INSTRUCTIONS.length - 1 && (
              <div className="flex items-center self-stretch px-0.5">
                <ChevronRight size={14} className="text-faint shrink-0" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* sm–md: 2-col grid, third item full-width below, down arrow between rows */}
      <div className="hidden sm:grid lg:hidden grid-cols-2 gap-2">
        {/* row 1: first two boxes with horizontal arrow */}
        <IxBox ix={INSTRUCTIONS[0]} active={activeIx === 0} />
        <IxBox ix={INSTRUCTIONS[1]} active={activeIx === 1} />

        {/* down arrow spanning both columns */}
        <div className="col-span-2 flex justify-center py-0.5">
          <ChevronDown size={14} className="text-faint" />
        </div>

        {/* row 2: third box, half-width aligned left */}
        <IxBox ix={INSTRUCTIONS[2]} active={activeIx === 2} />
      </div>

      {/* mobile: stacked, down arrows between */}
      <div className="flex flex-col gap-0 sm:hidden">
        {INSTRUCTIONS.map((ix, i) => (
          <div key={ix.name}>
            <IxBox ix={ix} active={activeIx === i} />
            {i < INSTRUCTIONS.length - 1 && (
              <div className="flex justify-center py-1.5">
                <ChevronDown size={14} className="text-faint" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* explainer */}
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
