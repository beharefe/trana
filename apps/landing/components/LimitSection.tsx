"use client"

import { useEffect, useRef } from "react"
import type AnimeJS from "animejs"
import { GridBg, CodeCard } from "./Hero"

export function LimitSection() {
  const sectionRef    = useRef<HTMLElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const pillRef       = useRef<HTMLDivElement>(null)
  const pillDotRef    = useRef<HTMLDivElement>(null)
  const pillLabelRef  = useRef<HTMLSpanElement>(null)
  const shieldGlowRef = useRef<HTMLDivElement>(null)
  const blockGlowRef  = useRef<HTMLDivElement>(null)
  const passkeyRef    = useRef<HTMLDivElement>(null)
  const statusRef     = useRef<HTMLSpanElement>(null)
  const checkRef      = useRef<SVGPathElement>(null)
  const xRef          = useRef<SVGPathElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    let stopped = false
    let started = false

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true
          run()
        }
      },
      { threshold: 0.35 }
    )
    observer.observe(section)

    async function run() {
      const { default: anime } = await import("animejs") as { default: typeof AnimeJS }
      if (stopped) return

      const container  = containerRef.current
      const pill       = pillRef.current
      const pillDot    = pillDotRef.current
      const pillLabel  = pillLabelRef.current
      const shieldGlow = shieldGlowRef.current
      const blockGlow  = blockGlowRef.current
      const passkey    = passkeyRef.current
      const status     = statusRef.current
      const check      = checkRef.current
      const xPath      = xRef.current

      if (!container || !pill || !pillDot || !pillLabel || !shieldGlow || !blockGlow || !passkey || !status || !check || !xPath) return

      const PILL_W = 140
      const wait   = (ms: number) => anime({ targets: {}, duration: ms, easing: "linear" }).finished

      while (!stopped) {
        // Rail: 8%→92% of card width = 0→2 SOL scale
        // Shield/limit line sits at 50% = 1.0 SOL
        const W        = container.getBoundingClientRect().width
        const railL    = W * 0.08
        const railSpan = W * 0.84
        const solToX   = (sol: number) => railL + railSpan * (sol / 2) - PILL_W / 2

        const startX   = railL                        // pill left-edge enters at 0 SOL mark
        const stop_04  = solToX(0.4)                  // 0.4 SOL — below limit
        const nearX    = solToX(1.0) - 30             // approaching limit
        const hitX     = solToX(1.0) + 14             // touches limit line
        const backX    = solToX(1.0) - 55             // bounces back
        const passX    = solToX(1.0) + 70             // past limit
        const endX     = W * 0.88 - PILL_W

        const reset = () => {
          anime.set(pill,       { translateX: startX, opacity: 1 })
          anime.set(shieldGlow, { opacity: 0 })
          anime.set(blockGlow,  { opacity: 0 })
          anime.set(xPath,      { opacity: 0 })
          anime.set(passkey,    { opacity: 0, translateX: "-50%", translateY: 18 })
          ;(check as SVGPathElement).style.strokeDashoffset = "46"
          ;(check as SVGPathElement).style.transition = "none"
          status.textContent = "IDLE"
        }

        // ── CYCLE 1: 0.4 SOL — below limit, passes freely ───────────────
        pillDot.style.background = "#7af0a8"
        pillLabel.textContent = "tx · 0.4 SOL"
        reset()
        await wait(500)
        if (stopped) break

        status.textContent = "TX SIGNED · INBOUND"
        await wait(350)
        if (stopped) break

        // Pill travels to 0.4 SOL mark, pauses
        await anime({ targets: pill, translateX: stop_04, duration: 900, easing: "cubicBezier(.2,.8,.2,1)" }).finished
        if (stopped) break
        status.textContent = "BELOW LIMIT · 0.4 SOL"
        await wait(600)
        if (stopped) break

        // Coasts through limit gate — brief green flash on shield
        anime({ targets: shieldGlow, opacity: 0.7, duration: 250, easing: "linear" })
        ;(check as SVGPathElement).style.transition = "stroke-dashoffset .35s ease"
        ;(check as SVGPathElement).style.strokeDashoffset = "0"
        await anime({ targets: pill, translateX: endX, opacity: 0, duration: 1600, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        anime({ targets: shieldGlow, opacity: 0, duration: 400, easing: "linear" })
        status.textContent = "EXECUTED · ✓"
        await wait(900)
        if (stopped) break

        // ── CYCLE 2: 1.4 SOL — exceeds limit, blocked ───────────────────
        pillDot.style.background = "#ff7a59"
        pillLabel.textContent = "tx · 1.4 SOL"
        reset()
        await wait(500)
        if (stopped) break

        status.textContent = "TX SIGNED · INBOUND"
        await wait(350)
        if (stopped) break

        // Pill approaches 1.0 SOL limit line
        await anime({ targets: pill, translateX: nearX, duration: 1300, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break

        // Blocked at limit
        anime({ targets: blockGlow, opacity: 1, duration: 400, easing: "linear" })
        anime({ targets: xPath,    opacity: 1, duration: 250, easing: "linear" })
        await anime({ targets: pill, translateX: hitX, duration: 380, easing: "cubicBezier(.5,1.6,.4,1)" }).finished
        status.textContent = "LIMIT EXCEEDED · DENIED"
        if (stopped) break
        await anime({ targets: pill, translateX: backX, duration: 340, easing: "cubicBezier(.2,.8,.2,1)" }).finished
        await wait(420)
        if (stopped) break

        // Passkey challenge
        anime({ targets: passkey, opacity: 1, translateX: "-50%", translateY: 0, duration: 600, easing: "cubicBezier(.2,.8,.2,1)" })
        status.textContent = "CHALLENGE · PASSKEY"
        await wait(1200)
        if (stopped) break

        // Authorized
        anime({ targets: xPath,      opacity: 0, duration: 250, easing: "linear" })
        anime({ targets: blockGlow,  opacity: 0, duration: 400, easing: "linear" })
        anime({ targets: shieldGlow, opacity: 1, duration: 500, easing: "linear" })
        ;(check as SVGPathElement).style.transition = "stroke-dashoffset .55s ease"
        ;(check as SVGPathElement).style.strokeDashoffset = "0"
        status.textContent = "AUTHORIZED · EXECUTING"
        await wait(700)
        if (stopped) break

        // Pill passes gate and exits
        anime({ targets: passkey, opacity: 0, translateX: "-50%", translateY: 18, duration: 500, easing: "easeInSine" })
        await anime({ targets: pill, translateX: passX, duration: 1200, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break
        await anime({ targets: pill, translateX: endX, opacity: 0, duration: 1000, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        status.textContent = "EXECUTED · ✓"
        await wait(1100)
      }
    }

    return () => {
      stopped = true
      observer.disconnect()
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="limit"
      className="relative min-h-screen px-6 sm:px-12 pt-[120px] pb-[180px] sm:pb-[140px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto mt-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Text */}
          <div className="max-w-[40ch]">
            <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-faint tracking-[0.08em] uppercase px-2.5 py-[5px] border border-white/[0.08] rounded-full bg-white/[0.015]">
              <span className="w-[7px] h-[7px] rounded-full bg-coral shrink-0" style={{ boxShadow: "0 0 10px #ff7a59" }} />
              Policy · Limit
            </span>
            <h2 className="font-serif text-[clamp(38px,5vw,72px)] leading-[0.98] tracking-[-0.035em] mt-6 mb-[18px] max-w-[18ch] text-balance text-ink">
              Enforce limits at the{" "}
              <em className="text-coral">chain level.</em>
            </h2>
            <p className="text-[clamp(16px,1.4vw,20px)] text-muted leading-[1.45] tracking-[-0.005em]">
              Small amounts flow free. Large ones need approval. The threshold
              lives in your program, not in a UI somebody could spoof.
            </p>
          </div>

          {/* Art */}
          <div
            ref={containerRef}
            className="relative h-[420px] sm:h-[480px] border border-white/[0.08] rounded-[18px] overflow-hidden"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.02), transparent 70%), #0d0e11" }}
          >
            {/* Card label */}
            <span className="absolute top-3.5 left-3.5 flex items-center gap-1.5 font-mono text-[10.5px] text-faint tracking-[0.06em]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral" style={{ boxShadow: "0 0 8px #ff7a59" }} />
              policy.limit
            </span>

            {/* ── Limit vertical line ───────────────────────────────── */}
            {/* Spans from ~18% to 50% (rail), positioned at 50% horizontal */}
            <div
              className="absolute left-1/2 -translate-x-px"
              style={{
                top: "18%",
                bottom: "35%",
                width: 1,
                backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,122,89,0.55) 0px, rgba(255,122,89,0.55) 4px, transparent 4px, transparent 8px)",
              }}
            />
            {/* Limit label above the line */}
            <span
              className="absolute left-1/2 font-mono text-[10.5px] tracking-[0.1em] whitespace-nowrap"
              style={{ top: "14%", transform: "translateX(-50%)", color: "#ff7a59" }}
            >
              limit · 1.0 SOL
            </span>

            {/* ── Rail ─────────────────────────────────────────────── */}
            <div
              className="absolute top-1/2 left-[8%] right-[8%] h-px -translate-y-1/2"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.04), rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04))" }}
            />

            {/* ── Scale tick marks on rail ──────────────────────────── */}
            {/* 0, 0.5, 1.0, 1.5, 2.0 SOL → positions 0%, 25%, 50%, 75%, 100% of rail */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const left = `calc(8% + ${pct}% * 0.84)`
              return (
                <div
                  key={pct}
                  className="absolute top-[calc(50%-5px)] w-px h-[10px]"
                  style={{ left, background: pct === 50 ? "rgba(255,122,89,0.6)" : "rgba(255,255,255,0.2)" }}
                />
              )
            })}

            {/* ── Scale labels below rail ───────────────────────────── */}
            <div
              className="absolute left-[8%] right-[8%] font-mono text-[10px] text-faint tracking-[0.06em]"
              style={{ top: "calc(50% + 14px)" }}
            >
              {(["0", "0.5", "1.0", "1.5", "2.0 SOL"] as const).map((label, i) => (
                <span
                  key={label}
                  className="absolute"
                  style={{
                    left: `${i * 25}%`,
                    transform: i === 4 ? "translateX(-100%)" : i === 0 ? "none" : "translateX(-50%)",
                    color: i === 2 ? "#ff7a59" : undefined,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* ── Glow rings ────────────────────────────────────────── */}
            <div ref={shieldGlowRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(122,240,168,0.18) 0%, transparent 70%)", opacity: 0 }} />
            <div ref={blockGlowRef}  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(255,122,89,0.22) 0%, transparent 70%)", opacity: 0 }} />

            {/* ── Shield ────────────────────────────────────────────── */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <svg width="60" height="70" viewBox="0 0 60 70" aria-hidden>
                <path d="M30 3 L57 12 L57 37 C57 51 44 62 30 68 C16 62 3 51 3 37 L3 12 Z"
                  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" />
                <path ref={checkRef}
                  d="M16 36 L26 46 L46 24"
                  stroke="#7af0a8" strokeWidth="2.4" fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="46" style={{ strokeDashoffset: 46 }}
                />
                <path ref={xRef}
                  d="M18 26 L42 50 M42 26 L18 50"
                  stroke="#ff7a59" strokeWidth="2.2" fill="none"
                  strokeLinecap="round" style={{ opacity: 0 }}
                />
              </svg>
            </div>

            {/* ── TX pill ───────────────────────────────────────────── */}
            <div
              ref={pillRef}
              className="absolute top-[calc(50%-14px)] flex items-center gap-2 px-3 rounded-full border border-white/25 bg-white/[0.06] font-mono text-[11.5px] text-zinc-200"
              style={{ left: 0, width: 140, height: 28 }}
            >
              <div ref={pillDotRef} className="w-[8px] h-[8px] rounded-full shrink-0" style={{ background: "#a1a1aa" }} />
              <span ref={pillLabelRef}>tx · 0.4 SOL</span>
            </div>

            {/* ── Passkey ───────────────────────────────────────────── */}
            <div
              ref={passkeyRef}
              className="absolute flex items-center gap-2 px-4 py-1.5 rounded-[10px] border border-white/35 bg-white/[0.04] font-mono text-[11.5px] text-ink whitespace-nowrap"
              style={{ top: "68%", left: "50%", opacity: 0 }}
            >
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <circle cx="5" cy="4" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 4 L5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              passkey · touch
            </div>

            {/* ── Status ────────────────────────────────────────────── */}
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-faint" />
              <span ref={statusRef} className="font-mono text-[11px] text-faint tracking-[0.14em]">IDLE</span>
            </div>
          </div>

        </div>
      </div>

      <CodeCard filename="policy::Limit" accent="#ff7a59">
        <span className="text-purple-300">trana</span>{"::"}<span className="text-white">enforce</span>
        {"(ctx, "}<span className="text-purple-300">Policy</span>{"::"}<span className="text-zinc-200">Limit</span>{" {\n"}
        {"  param_offset: "}<span className="text-orange-300">0</span>{",\n"}
        {"  limit:        "}<span className="text-orange-300">1_000_000_000</span>
        <span className="text-zinc-500 italic">{" // 1 SOL"}</span>{"\n})?;"}
      </CodeCard>
    </section>
  )
}
