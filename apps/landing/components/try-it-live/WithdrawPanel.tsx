"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, KeyRound, Clock } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type PolicyState = "A" | "B" | "C" | "D"

const POLICY_STATES: Record<PolicyState, { label: string; desc: string; result: string }> = {
  A: { label: "Small + no window",  desc: "< 1 SOL · wallet sign only",       result: "success" },
  B: { label: "Large amount",       desc: "≥ 1 SOL · passkey required",        result: "blocked" },
  C: { label: "Rapid consecutive",  desc: "Window open · passkey required",    result: "blocked" },
  D: { label: "Passkey approved",   desc: "Proof verified · executed",         result: "approved" },
}

type ResultState = "idle" | "success" | "blocked" | "approved"

// ── Sub-components ────────────────────────────────────────────────────────────

function PolicyLabel({ policy, inPlay }: { policy: string; inPlay: string }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <span className="font-mono text-[13px] font-medium text-ink">{policy}</span>
      <span className="font-mono text-[11px] text-faint">
        policy in play{" "}
        <span className="text-accent">{inPlay}</span>
      </span>
    </div>
  )
}

function AmountSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const MIN = 0.01
  const MAX = 5
  const LIMIT = 1.0
  const pct = ((value - MIN) / (MAX - MIN)) * 100
  const limitPct = ((LIMIT - MIN) / (MAX - MIN)) * 100

  return (
    <div className="space-y-3">
      <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase">
        Amount · {MIN} – {MAX} SOL
      </div>

      {/* big display */}
      <div className="flex items-baseline gap-2 px-4 py-3 rounded-xl border border-white/[0.10] bg-bg">
        <span className="font-sans font-semibold text-[28px] tracking-[-0.03em] text-ink leading-none flex-1">
          {value.toFixed(2)}
        </span>
        <span className="font-mono text-[13px] text-faint">SOL</span>
      </div>

      {/* slider */}
      <div className="relative py-2">
        {/* limit marker */}
        <div
          className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none z-10"
          style={{ left: `${limitPct}%` }}
        >
          <div className="h-full w-px bg-accent/40" />
        </div>

        <input
          type="range"
          min={MIN}
          max={MAX}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-[3px] rounded-full appearance-none cursor-pointer bg-white/[0.10] accent-accent"
          style={{
            background: `linear-gradient(to right, #c6ff3a ${pct}%, rgba(255,255,255,0.10) ${pct}%)`,
          }}
        />

        {/* labels */}
        <div className="flex justify-between mt-1.5 font-mono text-[10px] text-faint">
          <span>{MIN}</span>
          <span className="text-accent">↑ {LIMIT.toFixed(2)} limit</span>
          <span>{MAX.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

function DrainWindowCircle({ open, seconds }: { open: boolean; seconds: number }) {
  const radius = 30
  const circ   = 2 * Math.PI * radius
  const pct    = open ? seconds / 60 : 0
  const offset = circ * (1 - pct)

  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0">
        <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
          <circle cx="34" cy="34" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          {open && (
            <circle
              cx="34" cy="34" r={radius}
              stroke="#c6ff3a"
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 34 34)"
            />
          )}
        </svg>
      </div>
      <div>
        <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-1.5">Drain window</div>
        <div className="font-mono text-[12px] text-ink leading-snug">
          {open
            ? <span className="text-accent">{seconds}s remaining</span>
            : "Closed"}
        </div>
        <div className="font-mono text-[10px] text-faint mt-1 leading-relaxed">
          {open
            ? "Rapid withdrawals escalate to Require"
            : "60s window opens after a withdrawal"}
        </div>
      </div>
    </div>
  )
}

function LastResult({ state }: { state: ResultState }) {
  const map: Record<ResultState, { icon: React.ReactNode; label: string; color: string }> = {
    idle:     { icon: <Clock size={12} />,       label: "Awaiting first attempt", color: "text-faint" },
    success:  { icon: <CheckCircle2 size={12} />, label: "Confirmed — no passkey", color: "text-accent" },
    blocked:  { icon: <XCircle size={12} />,      label: "MissingProof 6000",      color: "text-[#ff5b1f]" },
    approved: { icon: <CheckCircle2 size={12} />, label: "ProofVerified — executed",color: "text-accent" },
  }
  const s = map[state]
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-1.5">Last result</div>
      <div className={`flex items-center gap-1.5 font-mono text-[12px] ${s.color}`}>
        {s.icon}
        {s.label}
      </div>
    </div>
  )
}

function DiscoveredStates({ discovered }: { discovered: PolicyState[] }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-2">
        Discovered states
      </div>
      <div className="space-y-1">
        {(Object.keys(POLICY_STATES) as PolicyState[]).map((key) => {
          const s   = POLICY_STATES[key]
          const hit = discovered.includes(key)
          return (
            <div
              key={key}
              className={[
                "flex items-start gap-3 px-3 py-2 rounded-lg border transition-colors",
                hit
                  ? "border-accent/20 bg-accent/[0.04]"
                  : "border-white/[0.06] bg-bg opacity-40",
              ].join(" ")}
            >
              <span className={`font-mono text-[11px] font-medium shrink-0 ${hit ? "text-accent" : "text-faint"}`}>
                {key}
              </span>
              <div>
                <div className="font-mono text-[11px] text-ink leading-none">{s.label}</div>
                <div className="font-mono text-[10px] text-faint mt-0.5">{s.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root panel ────────────────────────────────────────────────────────────────

export function WithdrawPanel() {
  const [amount,     setAmount]     = useState(0.4)
  const [result,     setResult]     = useState<ResultState>("idle")
  const [discovered, setDiscovered] = useState<PolicyState[]>([])
  const drainOpen    = false   // replace with live drain window state
  const drainSeconds = 0       // replace with countdown

  const isLarge    = amount >= 1.0
  const policyInPlay = isLarge ? "Limit (over threshold)" : "Limit (under threshold)"

  function handleWithdraw() {
    // placeholder — replace with wallet + RPC call
    if (isLarge) {
      setResult("blocked")
      setDiscovered((d) => [...new Set([...d, "B" as PolicyState])])
    } else {
      setResult("success")
      setDiscovered((d) => [...new Set([...d, "A" as PolicyState])])
    }
  }

  return (
    <div className="not-prose rounded-xl border border-white/[0.08] bg-card overflow-hidden">

      {/* panel header */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <PolicyLabel policy="Withdraw · attempt to drain" inPlay={policyInPlay} />
      </div>

      {/* 2-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/[0.06]">

        {/* ── Left: input + action ── */}
        <div className="p-5 bg-card space-y-5">
          <AmountSlider value={amount} onChange={setAmount} />

          <button
            type="button"
            onClick={handleWithdraw}
            className="w-full py-3 rounded-xl font-mono font-semibold text-[13px] tracking-[0.08em] text-bg bg-accent hover:brightness-110 transition-all uppercase"
          >
            Withdraw
          </button>

          {/* pool balance note — replace with live value */}
          <p className="font-mono text-[11px] text-faint leading-relaxed">
            Pool balance · — SOL. {isLarge ? "Passkey required above 1 SOL." : "Try a small amount first."}
          </p>
        </div>

        {/* ── Right: status ── */}
        <div className="p-5 bg-card space-y-6">
          <DrainWindowCircle open={drainOpen} seconds={drainSeconds} />
          <div className="h-px bg-white/[0.06]" />
          <LastResult state={result} />
          <div className="h-px bg-white/[0.06]" />
          <DiscoveredStates discovered={discovered} />
        </div>

      </div>
    </div>
  )
}
