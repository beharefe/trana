"use client"

import { useEffect, useRef } from "react"
import type AnimeJS from "animejs"
import { GridBg, CodeCard } from "./Hero"

export function DrainSection() {
  const sectionRef     = useRef<HTMLElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const pillRef        = useRef<HTMLDivElement>(null)
  const shieldGlowRef  = useRef<HTMLDivElement>(null)
  const blockGlowRef   = useRef<HTMLDivElement>(null)
  const windowFillRef  = useRef<HTMLDivElement>(null)
  const passkeyRef     = useRef<HTMLDivElement>(null)
  const statusRef      = useRef<HTMLSpanElement>(null)
  const checkRef       = useRef<SVGPathElement>(null)
  const xRef           = useRef<SVGPathElement>(null)
  const elapsedRef     = useRef<HTMLSpanElement>(null)

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
      const shieldGlow = shieldGlowRef.current
      const blockGlow  = blockGlowRef.current
      const windowFill = windowFillRef.current
      const passkey    = passkeyRef.current
      const status     = statusRef.current
      const check      = checkRef.current
      const xPath      = xRef.current
      const elapsed    = elapsedRef.current

      if (!container || !pill || !shieldGlow || !blockGlow || !windowFill || !passkey || !status || !check || !xPath || !elapsed) return

      const PILL_W = 140
      const wait   = (ms: number) => anime({ targets: {}, duration: ms, easing: "linear" }).finished

      while (!stopped) {
        const W        = container.getBoundingClientRect().width
        const shieldCX = W / 2
        const startX   = W * 0.08
        const nearX    = shieldCX - PILL_W - 30
        const hitX     = shieldCX - PILL_W + 14
        const backX    = shieldCX - PILL_W - 55
        const passX    = shieldCX + 22
        const endX     = W * 0.88 - PILL_W

        // ── reset ────────────────────────────────────────────────────
        anime.set(pill,       { translateX: startX, opacity: 1 })
        anime.set(shieldGlow, { opacity: 0 })
        anime.set(blockGlow,  { opacity: 0 })
        anime.set(xPath,      { opacity: 0 })
        anime.set(passkey,    { opacity: 0, translateX: "-50%", translateY: 18 })
        anime.set(windowFill, { width: "0%" })
        ;(check as SVGPathElement).style.strokeDashoffset = "46"
        ;(check as SVGPathElement).style.transition = "none"
        elapsed.textContent = "elapsed · 0.0s"
        status.textContent  = "IDLE"
        await wait(600)
        if (stopped) break

        // ── deposit lands — window opens ─────────────────────────────
        status.textContent = "DEPOSIT · +12 SOL"
        await wait(700)
        if (stopped) break

        // Window expands from deposit marker toward shield
        // Deposit marker is at 20% of card; shield at 50%; fill spans 30% of card width
        const fillDur   = 1400
        const fillStart = performance.now()
        anime({ targets: windowFill, width: "30%", duration: fillDur, easing: "linear" })

        while (performance.now() - fillStart < fillDur && !stopped) {
          const p   = Math.min(1, (performance.now() - fillStart) / fillDur)
          elapsed.textContent = `elapsed · ${(p * 9.4).toFixed(1)}s`
          await new Promise<void>((r) => requestAnimationFrame(() => r()))
        }
        elapsed.textContent = "elapsed · 9.4s"
        if (stopped) break

        // ── withdraw TX fires — inbound ──────────────────────────────
        status.textContent = "WITHDRAW · −12 SOL · INBOUND"
        await wait(400)
        if (stopped) break

        // Pill travels toward shield
        await anime({ targets: pill, translateX: nearX, duration: 1300, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break

        // Blocked — rapid drain detected
        anime({ targets: blockGlow, opacity: 1, duration: 400, easing: "linear" })
        anime({ targets: xPath,    opacity: 1, duration: 250, easing: "linear" })
        await anime({ targets: pill, translateX: hitX, duration: 380, easing: "cubicBezier(.5,1.6,.4,1)" }).finished
        status.textContent = "DRAIN PATTERN · DETECTED"
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

        // Pill passes through and exits
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
      id="drain"
      className="relative min-h-screen px-6 sm:px-12 pt-[120px] pb-[180px] sm:pb-[140px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto mt-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Text */}
          <div className="max-w-[40ch]">
            <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-faint tracking-[0.08em] uppercase px-2.5 py-[5px] border border-white/[0.08] rounded-full bg-white/[0.015]">
              <span className="w-[7px] h-[7px] rounded-full bg-danger shrink-0" style={{ boxShadow: "0 0 10px #ff5560" }} />
              Policy · RapidDrain
            </span>
            <h2 className="font-serif text-[clamp(38px,5vw,72px)] leading-[0.98] tracking-[-0.035em] mt-6 mb-[18px] max-w-[18ch] text-balance text-ink">
              Detect{" "}
              <em className="text-danger not-italic">drain</em>{" "}
              patterns.
            </h2>
            <p className="text-[clamp(16px,1.4vw,20px)] text-muted leading-[1.45] tracking-[-0.005em]">
              Deposit then immediately withdraw? That&rsquo;s the signature
              of a compromise, not a customer. Trana sees it on chain and
              stops it before it lands.
            </p>
          </div>

          {/* Art — same rail + pill + shield as other sections */}
          <div
            ref={containerRef}
            className="relative h-[420px] sm:h-[480px] border border-white/[0.08] rounded-[18px] overflow-hidden"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.02), transparent 70%), #0d0e11" }}
          >
            {/* Card label */}
            <span className="absolute top-3.5 left-3.5 flex items-center gap-1.5 font-mono text-[10.5px] text-faint tracking-[0.06em]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger" style={{ boxShadow: "0 0 8px #ff5560" }} />
              policy.rapid_drain
            </span>

            {/* Stage labels */}
            <span className="absolute top-[14%] left-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">01 · DEPOSIT</span>
            <span className="absolute top-[14%] left-1/2 -translate-x-1/2 font-mono text-[10.5px] text-danger tracking-[0.14em] whitespace-nowrap">02 · 30s WINDOW</span>
            <span className="absolute top-[14%] right-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">03 · EXEC</span>

            {/* Deposit marker — vertical dashed line at 20% */}
            <div
              className="absolute left-[20%] -translate-x-px"
              style={{
                top: "20%", bottom: "34%",
                width: 1,
                backgroundImage: "repeating-linear-gradient(to bottom, rgba(122,240,168,0.55) 0px, rgba(122,240,168,0.55) 4px, transparent 4px, transparent 8px)",
              }}
            />
            <span
              className="absolute left-[20%] font-mono text-[10.5px] whitespace-nowrap"
              style={{ top: "14%", transform: "translateX(-50%)", color: "#7af0a8" }}
            >
              +12 SOL
            </span>

            {/* Window fill — expands from deposit marker (20%) toward shield (50%) */}
            <div
              ref={windowFillRef}
              className="absolute top-[calc(50%-18px)] left-[20%]"
              style={{
                height: 36,
                width: "0%",
                background: "linear-gradient(90deg, rgba(255,85,96,0.18), rgba(255,85,96,0.02))",
                borderRight: "1px dashed rgba(255,85,96,0.35)",
              }}
            />

            {/* Rail */}
            <div
              className="absolute top-1/2 left-[8%] right-[8%] h-px -translate-y-1/2"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.04), rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04))" }}
            />
            {/* Tick marks */}
            {["left-[8%]", "left-1/2 -translate-x-1/2", "right-[8%]"].map((pos) => (
              <div key={pos} className={`absolute top-[calc(50%-8px)] w-px h-4 bg-white/20 ${pos}`} />
            ))}
            {/* Rail dots */}
            {[28, 34, 40, 60, 66, 72, 78].map((pct) => (
              <div key={pct} className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-white/20" style={{ left: `${pct}%` }} />
            ))}

            {/* Elapsed label below rail */}
            <span
              ref={elapsedRef}
              className="absolute font-mono text-[10.5px] text-faint tracking-[0.06em]"
              style={{ top: "calc(50% + 14px)", left: "20%", transform: "translateX(-50%)" }}
            >
              elapsed · 0.0s
            </span>

            {/* Glow rings */}
            <div ref={shieldGlowRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(122,240,168,0.18) 0%, transparent 70%)", opacity: 0 }} />
            <div ref={blockGlowRef}  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(255,85,96,0.22) 0%, transparent 70%)", opacity: 0 }} />

            {/* Shield */}
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
                  stroke="#ff5560" strokeWidth="2.2" fill="none"
                  strokeLinecap="round" style={{ opacity: 0 }}
                />
              </svg>
            </div>

            {/* TX pill — the withdrawal attempt */}
            <div
              ref={pillRef}
              className="absolute top-[calc(50%-14px)] flex items-center gap-2 px-3 rounded-full border border-white/25 bg-white/[0.06] font-mono text-[11.5px] text-zinc-200"
              style={{ left: 0, width: 140, height: 28 }}
            >
              <div className="w-[8px] h-[8px] rounded-full bg-danger shrink-0" />
              tx · −12 SOL
            </div>

            {/* Passkey */}
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

            {/* Status */}
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-faint" />
              <span ref={statusRef} className="font-mono text-[11px] text-faint tracking-[0.14em]">IDLE</span>
            </div>
          </div>

        </div>
      </div>

      <CodeCard filename="policy::RapidDrain" accent="#ff5560">
        <span className="text-purple-300">trana</span>{"::"}<span className="text-white">enforce</span>
        {"(ctx, "}<span className="text-purple-300">Policy</span>{"::"}<span className="text-zinc-200">RapidDrain</span>{" {\n"}
        {"  last_deposit_at,\n"}
        {"  last_deposit_amount,\n"}
        {"  ..\n})?;"}
      </CodeCard>
    </section>
  )
}
