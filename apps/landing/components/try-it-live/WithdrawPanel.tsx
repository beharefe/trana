import { CheckCircle2, XCircle, KeyRound, Clock } from "lucide-react"

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ["Small pull", "Large pull", "Rapid pulls", "Approve"] as const
type Tab = typeof TABS[number]

function PanelTabs({ active = "Small pull" }: { active?: Tab }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-bg border border-white/[0.07]">
      {TABS.map((t) => (
        /* add onClick from parent */
        <button
          key={t}
          type="button"
          className={[
            "flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap",
            t === active
              ? "bg-card text-ink shadow-sm"
              : "text-faint hover:text-muted",
          ].join(" ")}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Amount row ────────────────────────────────────────────────────────────────

function AmountRow() {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 flex items-center gap-2 px-4 rounded-lg border border-white/[0.10] bg-bg">
        {/* value → controlled by parent */}
        <input
          type="number"
          placeholder="0.00"
          readOnly
          className="flex-1 bg-transparent border-0 outline-none font-mono text-[15px] text-ink placeholder:text-faint py-2.5"
        />
        <span className="font-mono text-[12px] text-faint shrink-0">SOL</span>
      </div>
      {["0.1", "0.5", "1.0"].map((v) => (
        <button
          key={v}
          type="button"
          className="px-2.5 rounded-lg border border-white/[0.10] font-mono text-[12px] text-faint hover:text-ink hover:border-white/[0.20] transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  )
}

// ── Result badge ──────────────────────────────────────────────────────────────

type ResultState = "success" | "blocked" | "passkey" | "idle"

const RESULT_MAP: Record<ResultState, {
  icon:   React.ReactNode
  label:  string
  color:  string
  bg:     string
  border: string
}> = {
  success: { icon: <CheckCircle2 size={14} />, label: "No passkey needed",  color: "#c6ff3a", bg: "rgba(198,255,58,0.07)",  border: "rgba(198,255,58,0.18)" },
  blocked: { icon: <XCircle      size={14} />, label: "MissingProof 6000",  color: "#ff5b1f", bg: "rgba(255,91,31,0.07)",   border: "rgba(255,91,31,0.18)"  },
  passkey: { icon: <KeyRound     size={14} />, label: "Passkey required",   color: "#5aa9ff", bg: "rgba(90,169,255,0.07)",  border: "rgba(90,169,255,0.18)" },
  idle:    { icon: <Clock        size={14} />, label: "Waiting…",           color: "rgba(235,232,224,0.3)", bg: "transparent", border: "rgba(235,232,224,0.08)" },
}

function ResultBadge({ state = "success" }: { state?: ResultState }) {
  const s = RESULT_MAP[state]
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-[12px]"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
    >
      {s.icon}
      {s.label}
    </div>
  )
}

// ── Drain window bar ──────────────────────────────────────────────────────────

function DrainWindow() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-white/[0.07] bg-bg">
      <span className="font-mono text-[10.5px] text-faint tracking-[0.04em] uppercase">Drain window</span>
      <div className="flex items-center gap-2">
        {/* timer value → replace with countdown */}
        <span className="font-mono text-[11px] text-faint">— s remaining</span>
        <div className="w-20 h-[3px] rounded-full bg-white/[0.08]">
          {/* fill via inline style width from state */}
          <div className="h-full w-0 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type Props = {
  activeTab?:    Tab
  resultState?:  ResultState
  explanation?:  string
  policyLabel?:  string
}

export function WithdrawPanel({
  activeTab    = "Small pull",
  resultState  = "success",
  explanation  = "Amount is below the 1 SOL limit. Transaction confirmed without a passkey prompt.",
  policyLabel  = "Limit · threshold 1 SOL",
}: Props) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      {/* tabs */}
      <div className="p-4 border-b border-white/[0.06]">
        <PanelTabs active={activeTab} />
      </div>

      {/* body */}
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">Policy</span>
          <span className="font-mono text-[10.5px] text-accent tracking-[0.04em]">{policyLabel}</span>
        </div>

        <AmountRow />

        {/* primary action — wire onClick from parent */}
        <button
          type="button"
          className="w-full py-3 rounded-lg font-semibold text-[14px] text-bg bg-accent hover:brightness-110 transition-all tracking-[-0.01em]"
        >
          Withdraw
        </button>

        <ResultBadge state={resultState} />

        <p className="text-[12.5px] text-muted leading-relaxed">{explanation}</p>
      </div>

      <div className="px-5 pb-4">
        <DrainWindow />
      </div>
    </div>
  )
}
