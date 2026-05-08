"use client"

import { useEffect, useRef, useState } from "react"

// stub kept for backwards-compat with legacy section files
export function CodeCard(_: { filename: string; accent?: string; children: React.ReactNode }) { return null }

// ── Types ─────────────────────────────────────────────────────────────────────

type StageState = "idle" | "active" | "done" | "challenge" | "verified"

interface AnimState {
  wallet:       StageState
  guard:        StageState
  program:      StageState
  walletLabel:  string
  guardLabel:   string
  programLabel: string
}

type LogPart  = { text: string; color?: string }
interface LogRow {
  ts:    string
  lvl:   "eval" | "ok" | "warn"
  parts: LogPart[]
}

const IDLE: AnimState = {
  wallet: "idle", guard: "idle", program: "idle",
  walletLabel: "signed", guardLabel: "pending", programLabel: "locked",
}

function nowTs() {
  const t = new Date()
  return (
    String(t.getUTCHours()).padStart(2, "0") + ":" +
    String(t.getUTCMinutes()).padStart(2, "0") + ":" +
    String(t.getUTCSeconds()).padStart(2, "0")
  )
}

function wait(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

// ── Grid background (shared export) ──────────────────────────────────────────

export function GridBg() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: [
          "linear-gradient(to right, rgba(235,232,224,0.04) 1px, transparent 1px)",
          "linear-gradient(to bottom, rgba(235,232,224,0.04) 1px, transparent 1px)",
        ].join(","),
        backgroundSize: "84px 84px",
        maskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, #000 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 50%, #000 40%, transparent 100%)",
      }}
    />
  )
}

// ── Stage component ───────────────────────────────────────────────────────────

function Stage({ num, icon, role, name, meta, state, label, showConnector }: {
  num: string; icon: React.ReactNode; role: string; name: string; meta: string
  state: StageState; label: string; showConnector: boolean
}) {
  const isActive    = state === "active"
  const isDone      = state === "done"
  const isChallenge = state === "challenge"
  const isVerified  = state === "verified"

  let borderColor = "var(--rule)",         bg          = "var(--ink)"
  let glyphBorder = "var(--rule-2)",        glyphColor  = "var(--bone-2)"
  let stateColor  = "var(--bone-4)",        stateBorder = "var(--rule)"
  let dotColor    = "var(--bone-5)",        dotClass    = ""

  if (isActive) {
    borderColor = "rgba(90,169,255,0.55)";  bg          = "rgba(90,169,255,0.04)"
    glyphBorder = "var(--azure)";           glyphColor  = "var(--azure)"
    stateColor  = "var(--azure)";           stateBorder = "rgba(90,169,255,0.55)"
    dotColor    = "var(--azure)";           dotClass    = "animate-dot-azure"
  } else if (isDone) {
    borderColor = "rgba(198,255,58,0.45)";  bg          = "rgba(198,255,58,0.025)"
    glyphBorder = "var(--lime)";            glyphColor  = "var(--lime)"
    stateColor  = "var(--lime)";            stateBorder = "rgba(198,255,58,0.45)"
    dotColor    = "var(--lime)"
  } else if (isChallenge) {
    borderColor = "rgba(255,168,76,0.55)";  bg          = "rgba(255,168,76,0.05)"
    glyphBorder = "var(--plasma)";          glyphColor  = "var(--plasma)"
    stateColor  = "var(--plasma)";          stateBorder = "rgba(255,168,76,0.55)"
    dotColor    = "var(--plasma)";          dotClass    = "animate-dot-amber"
  } else if (isVerified) {
    borderColor = "rgba(198,255,58,0.55)";  bg          = "rgba(198,255,58,0.06)"
    glyphBorder = "var(--lime)";            glyphColor  = "var(--lime)"
    stateColor  = "var(--lime)";            stateBorder = "rgba(198,255,58,0.55)"
    dotColor    = "var(--lime)"
  }

  return (
    <div
      className={`relative will-change-transform ${isChallenge ? "animate-guard-shake" : ""}`}
      style={{ border: `1px solid ${borderColor}`, background: bg, transition: isChallenge ? "none" : "border-color 240ms, background 240ms" }}
    >
      {showConnector && (
        <div className="absolute left-[44px] pointer-events-none" style={{ top: "-28px", width: "1px", height: "28px", backgroundImage: "linear-gradient(to bottom, var(--rule-3) 50%, transparent 50%)", backgroundSize: "1px 6px" }} />
      )}
      {isActive && (
        <div className="absolute left-0 right-0 bottom-0 h-[1.5px] pointer-events-none animate-prog-bar" style={{ background: "var(--azure)" }} />
      )}

      <div className="stage-grid">
        {/* Glyph */}
        <div
          className={`relative w-[60px] h-[60px] flex items-center justify-center ${isVerified ? "animate-glyph-flash" : ""}`}
          style={{ border: `1px solid ${glyphBorder}`, background: "var(--ink-2)", color: glyphColor }}
        >
          <span className="absolute top-[-8px] left-[-8px] w-[18px] h-[18px] flex items-center justify-center font-mono text-[9px]" style={{ background: "var(--ink)", border: "1px solid var(--rule-2)", color: "var(--bone-3)" }}>
            {num}
          </span>
          {icon}
        </div>

        {/* Body */}
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] tracking-[0.22em] uppercase mb-1" style={{ color: "var(--bone-4)" }}>{role}</div>
          <div className="font-serif text-[18px] sm:text-[24px] leading-none mb-1.5" style={{ color: "var(--bone)" }}>{name}</div>
          <div className="font-mono text-[11px] tracking-[0.02em] truncate" style={{ color: "var(--bone-3)" }}>{meta}</div>
        </div>

        {/* State */}
        <div className="inline-flex items-center justify-center gap-2 px-[9px] py-1.5 font-mono text-[10.5px] tracking-[0.16em] uppercase" style={{ color: stateColor, border: `1px solid ${stateBorder}` }}>
          {isVerified ? (
            <svg className="animate-check-draw w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          ) : (
            <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${dotClass}`} style={{ background: dotColor }} />
          )}
          <span className="truncate">{label}</span>
        </div>
      </div>
    </div>
  )
}

// ── Log row renderer ──────────────────────────────────────────────────────────

function LogMsg({ parts }: { parts: LogPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.color
          ? <span key={i} style={{ color: p.color }}>{p.text}</span>
          : <span key={i}>{p.text}</span>
      )}
    </>
  )
}

// ── Guard Panel ───────────────────────────────────────────────────────────────

function GuardPanel() {
  const cancelRef = useRef(false)
  const [anim, setAnim]         = useState<AnimState>(IDLE)
  const [log, setLog]           = useState<LogRow[]>([])
  const [slot, setSlot]         = useState(317_409_221)
  const [rcptTime, setRcptTime] = useState("21:04:18 UTC")

  useEffect(() => {
    cancelRef.current = false
    let s = 317_409_221

    const addEntry = (lvl: LogRow["lvl"], parts: LogPart[]) => {
      if (cancelRef.current) return
      const ts = nowTs()
      setRcptTime(ts + " UTC")
      setLog(prev => [...prev, { ts, lvl, parts }].slice(-5))
    }

    async function cycle() {
      setAnim(IDLE)
      setLog([])
      addEntry("eval", [{ text: "guard::enforce · slot " }, { text: s.toLocaleString("en-US"), color: "var(--bone-2)" }])
      await wait(700); if (cancelRef.current) return

      // wallet signs
      setAnim(st => ({ ...st, wallet: "active", walletLabel: "tx · signing" }))
      addEntry("eval", [{ text: "tx · 3 ix · signer = " }, { text: "7Tg…dmLmS", color: "var(--azure)" }])
      await wait(1400); if (cancelRef.current) return

      // guard evaluates
      setAnim(st => ({ ...st, wallet: "done", walletLabel: "signed", guard: "active", guardLabel: "evaluating" }))
      addEntry("eval", [{ text: "ix[N−2] secp256r1::verify " }, { text: "P-256", color: "var(--azure)" }])
      await wait(1200); if (cancelRef.current) return

      // ── passkey required: shake + amber — hold long enough to read ──
      setAnim(st => ({ ...st, guard: "challenge", guardLabel: "passkey" }))
      addEntry("eval", [{ text: "awaiting " }, { text: "P-256", color: "var(--azure)" }, { text: " assertion · touch device" }])
      await wait(3200); if (cancelRef.current) return

      // ── proof verified: checkmark draws in — hold so it's clearly seen ──
      setAnim(st => ({ ...st, guard: "verified", guardLabel: "verified ✓" }))
      addEntry("ok", [{ text: "PROOF · VERIFIED " }, { text: "✓", color: "var(--lime)" }])
      await wait(1400); if (cancelRef.current) return

      // guard passes, program runs
      setAnim(st => ({ ...st, guard: "done", guardLabel: "ok", program: "active", programLabel: "executing" }))
      addEntry("eval", [{ text: "ix[N] cpi → guard::enforce " }, { text: "policy::Require", color: "var(--azure)" }])
      await wait(700); if (cancelRef.current) return

      addEntry("eval", [{ text: "vault::withdraw · 2.500 SOL" }])
      await wait(1400); if (cancelRef.current) return

      setAnim(st => ({ ...st, program: "done", programLabel: "committed" }))
      addEntry("ok", [{ text: "EXECUTED " }, { text: "✓", color: "var(--lime)" }, { text: " · sig 4xR…q9N" }])
      s += 2
      setSlot(s)
      await wait(3500)
    }

    async function loop() {
      while (!cancelRef.current) await cycle()
    }

    loop()
    return () => { cancelRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {/* Panel */}
      <div className="relative overflow-hidden" style={{ border: "1px solid var(--rule-2)", background: "linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%)" }}>
        <div className="absolute top-[-1px] left-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderTop: "1px solid var(--lime)", borderLeft: "1px solid var(--lime)" }} />
        <div className="absolute bottom-[-1px] right-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderBottom: "1px solid var(--lime)", borderRight: "1px solid var(--lime)" }} />

        <div className="flex items-center gap-[14px] h-10 px-4 border-b" style={{ borderColor: "var(--rule)", background: "rgba(235,232,224,0.015)" }}>
          <span className="font-mono text-[10.5px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-2)" }}>guard::enforce</span>
          <div className="ml-auto flex items-center gap-[10px] font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span>slot</span>
            <span style={{ color: "var(--bone-2)" }}>{slot.toLocaleString("en-US")}</span>
            <span style={{ color: "var(--lime)" }}>· live</span>
          </div>
        </div>

        <div className="flex flex-col px-[14px] sm:px-[22px] pt-7 pb-3">
          <Stage num="01" state={anim.wallet} label={anim.walletLabel} role="Caller · signer" name="Wallet" meta="7Tg…dmLmS · sends tx" showConnector={false} icon={<WalletIcon />} />
          <div className="mt-7"><Stage num="02" state={anim.guard} label={anim.guardLabel} role="CPI · policy gate" name="Trana Guard" meta="require · proof" showConnector={true} icon={<ShieldIcon />} /></div>
          <div className="mt-7"><Stage num="03" state={anim.program} label={anim.programLabel} role="Your program" name="vault::withdraw" meta="protected · executes on PASS" showConnector={true} icon={<ProgramIcon />} /></div>
        </div>
      </div>

      {/* Audit log */}
      <div className="mt-[14px]" style={{ border: "1px solid var(--rule)", background: "var(--ink-2)" }}>
        <div className="flex items-center gap-[10px] h-8 px-[14px] border-b font-mono text-[10px] tracking-[0.22em] uppercase" style={{ borderColor: "var(--rule)", color: "var(--bone-4)" }}>
          <span>guard · audit</span>
          <span className="ml-auto" style={{ color: "var(--bone-3)" }}>{rcptTime}</span>
        </div>
        <div className="px-[14px] py-3 font-mono text-[11.5px] leading-[1.85]" style={{ color: "var(--bone-2)", minHeight: "132px" }}>
          {log.map((row, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-[72px] shrink-0" style={{ color: "var(--bone-4)" }}>{row.ts}</span>
              <span className="w-11 shrink-0" style={{ color: row.lvl === "ok" ? "var(--lime)" : row.lvl === "warn" ? "var(--amber)" : "var(--azure)" }}>
                {row.lvl.toUpperCase()}
              </span>
              <span className="min-w-0"><LogMsg parts={row.parts} /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function WalletIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H4a1 1 0 0 1-1-1Z"/>
      <path d="M3 7a1 1 0 0 1 1-1h13M16 13h2"/>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V6l-8-3Z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  )
}

function ProgramIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="0.5"/>
      <rect x="9" y="9" width="6" height="6" rx="0.5"/>
      <path d="M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2"/>
    </svg>
  )
}

// ── Hero section ──────────────────────────────────────────────────────────────

export function Hero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center border-b overflow-hidden" style={{ borderColor: "var(--rule)" }}>
      <GridBg />
      <div aria-hidden className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(235,232,224,0.02) 0 1px, transparent 1px 3px)", mixBlendMode: "overlay" }} />

      <div className="relative z-10 w-full sec-wrap">
        <div className="hero-layout">

          {/* Left: copy */}
          <div className="pb-2 lg:pb-10">
            <h1 className="font-serif font-normal leading-[0.96] tracking-[-0.025em] mb-[22px] text-balance" style={{ fontSize: "clamp(48px,7.6vw,92px)", color: "var(--bone)" }}>
              Execution-time<br />
              <em>authorization</em><br />
              for Solana.
            </h1>

            <p className="text-[19px] leading-[1.55] font-light mb-9 max-w-[540px]" style={{ color: "var(--bone-2)" }}>
              Two primitives for the authorization layer of Solana.{" "}
              <span className="font-mono font-medium text-[16.5px]" style={{ color: "var(--bone)" }}>Guard</span>{" "}
              secures <em>what can execute</em> with one CPI call.{" "}
              <span className="font-mono font-medium text-[16.5px]" style={{ color: "var(--bone)" }}>Authority</span>{" "}
              secures <em>who can authorize</em> — upgrades, mints, freezes, any PDA — with zero changes to the target program.
            </p>

            <div className="flex gap-3 flex-wrap">
              <a href="/try" className="inline-flex items-center gap-[9px] h-11 px-[18px] font-mono text-[12px] tracking-[0.14em] uppercase" style={{ background: "var(--lime)", color: "var(--ink)", border: "1px solid var(--lime)" }}>
                <span>Try it on devnet</span>
                <span>→</span>
              </a>
              <a href="https://github.com/beharefe/trana-guard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[9px] h-11 px-[18px] font-mono text-[12px] tracking-[0.14em] uppercase" style={{ color: "var(--bone-2)", border: "1px solid var(--rule)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 19c-4 1-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>
                </svg>
                <span>View on GitHub</span>
              </a>
            </div>
          </div>

          {/* Right: guard panel */}
          <div className="min-w-0">
            <GuardPanel />
          </div>
        </div>
      </div>
    </section>
  )
}
