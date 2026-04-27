"use client"

import { useEffect, useRef } from "react"
import type AnimeJS from "animejs"
import { GridBg, CodeCard } from "./Hero"

export function NotBeforeSection() {
  const sectionRef    = useRef<HTMLElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const pillRef       = useRef<HTMLDivElement>(null)
  const shieldGlowRef = useRef<HTMLDivElement>(null)
  const blockGlowRef  = useRef<HTMLDivElement>(null)
  const passkeyRef    = useRef<HTMLDivElement>(null)
  const statusRef     = useRef<HTMLSpanElement>(null)
  const checkRef      = useRef<SVGPathElement>(null)
  const xRef          = useRef<SVGPathElement>(null)
  const nowBadgeRef   = useRef<HTMLDivElement>(null)
  const nowLabelRef   = useRef<HTMLSpanElement>(null)

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
      const passkey    = passkeyRef.current
      const status     = statusRef.current
      const check      = checkRef.current
      const xPath      = xRef.current
      const nowBadge   = nowBadgeRef.current
      const nowLabel   = nowLabelRef.current

      if (!container || !pill || !shieldGlow || !blockGlow || !passkey || !status || !check || !xPath || !nowBadge || !nowLabel) return

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

        // NOW badge sits above the rail; left% maps directly to card width
        const nowBeforeX = W * 0.29   // ~T−3 (left of threshold)
        const nowAfterX  = W * 0.65   // ~T+2 (right of threshold)

        const resetCommon = () => {
          anime.set(pill,       { translateX: startX, opacity: 1 })
          anime.set(shieldGlow, { opacity: 0 })
          anime.set(blockGlow,  { opacity: 0 })
          anime.set(xPath,      { opacity: 0 })
          anime.set(passkey,    { opacity: 0, translateX: "-50%", translateY: 18 })
          ;(check as SVGPathElement).style.strokeDashoffset = "46"
          ;(check as SVGPathElement).style.transition = "none"
          status.textContent = "IDLE"
        }

        // ── CYCLE 1: NOW is BEFORE notBefore — passkey required ──────
        resetCommon()
        // Position NOW badge left of threshold, gold
        anime.set(nowBadge, { translateX: nowBeforeX })
        nowBadge.style.borderColor = "rgba(243,215,122,0.4)"
        nowBadge.style.background  = "rgba(243,215,122,0.06)"
        nowLabel.style.color       = "#f3d77a"
        nowLabel.textContent       = "NOW · T−3s"

        await wait(500)
        if (stopped) break

        status.textContent = "TX SIGNED · INBOUND"
        await wait(350)
        if (stopped) break

        // Pill travels toward gate
        await anime({ targets: pill, translateX: nearX, duration: 1300, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break

        // Blocked — before threshold, passkey required
        anime({ targets: blockGlow, opacity: 1, duration: 400, easing: "linear" })
        anime({ targets: xPath,    opacity: 1, duration: 250, easing: "linear" })
        await anime({ targets: pill, translateX: hitX, duration: 380, easing: "cubicBezier(.5,1.6,.4,1)" }).finished
        status.textContent = "BEFORE notBefore · PASSKEY"
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

        anime({ targets: passkey, opacity: 0, translateX: "-50%", translateY: 18, duration: 500, easing: "easeInSine" })
        await anime({ targets: pill, translateX: passX, duration: 1200, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break
        await anime({ targets: pill, translateX: endX, opacity: 0, duration: 1000, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        status.textContent = "EXECUTED · ✓"
        await wait(800)
        if (stopped) break

        // ── Time advances — NOW crosses the threshold ────────────────
        status.textContent = "TIME ADVANCING…"
        nowLabel.textContent = "NOW · crossing…"
        await anime({ targets: nowBadge, translateX: nowAfterX, duration: 1400, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        // NOW badge turns green — past the threshold
        nowBadge.style.borderColor = "rgba(122,240,168,0.4)"
        nowBadge.style.background  = "rgba(122,240,168,0.06)"
        nowLabel.style.color       = "#7af0a8"
        nowLabel.textContent       = "NOW · T+2s"
        await wait(600)
        if (stopped) break

        // ── CYCLE 2: NOW is AFTER notBefore — passes freely ──────────
        anime.set(shieldGlow, { opacity: 0 })
        anime.set(pill, { translateX: startX, opacity: 1 })
        ;(check as SVGPathElement).style.strokeDashoffset = "46"
        ;(check as SVGPathElement).style.transition = "none"

        status.textContent = "TX SIGNED · INBOUND"
        await wait(350)
        if (stopped) break

        // Pill travels — no blocking, brief green flash as it passes
        await anime({ targets: pill, translateX: nearX, duration: 1300, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        if (stopped) break

        status.textContent = "AFTER notBefore · ALLOW"
        anime({ targets: shieldGlow, opacity: 0.7, duration: 250, easing: "linear" })
        ;(check as SVGPathElement).style.transition = "stroke-dashoffset .35s ease"
        ;(check as SVGPathElement).style.strokeDashoffset = "0"
        await wait(300)
        if (stopped) break

        await anime({ targets: pill, translateX: endX, opacity: 0, duration: 1600, easing: "cubicBezier(.4,.0,.2,1)" }).finished
        anime({ targets: shieldGlow, opacity: 0, duration: 500, easing: "linear" })
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
      id="notbefore"
      className="relative min-h-screen px-6 sm:px-12 pt-[120px] pb-[180px] sm:pb-[140px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto mt-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Text */}
          <div className="max-w-[40ch]">
            <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-faint tracking-[0.08em] uppercase px-2.5 py-[5px] border border-white/[0.08] rounded-full bg-white/[0.015]">
              <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: "#f3d77a", boxShadow: "0 0 10px #f3d77a" }} />
              Policy · NotBefore
            </span>
            <h2 className="font-serif text-[clamp(38px,5vw,72px)] leading-[0.98] tracking-[-0.035em] mt-6 mb-[18px] max-w-[18ch] text-balance text-ink">
              Early is{" "}
              <em style={{ color: "#f3d77a" }}>suspicious.</em>
            </h2>
            <p className="text-[clamp(16px,1.4vw,20px)] text-muted leading-[1.45] tracking-[-0.005em]">
              Before the timestamp, every privileged call needs approval.
              After, it goes through clean. Vesting cliffs, upgrade delays,
              governance windows: the chain enforces them.
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
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#f3d77a", boxShadow: "0 0 8px #f3d77a" }} />
              policy.not_before
            </span>

            {/* Stage labels */}
            <span className="absolute top-[14%] left-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">earlier</span>
            <span className="absolute top-[14%] left-1/2 -translate-x-1/2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap" style={{ color: "#f3d77a" }}>not_before</span>
            <span className="absolute top-[14%] right-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">later</span>

            {/* Threshold vertical dashed line at center */}
            <div
              className="absolute left-1/2 -translate-x-px"
              style={{
                top: "20%", bottom: "34%",
                width: 1,
                backgroundImage: "repeating-linear-gradient(to bottom, rgba(243,215,122,0.5) 0px, rgba(243,215,122,0.5) 4px, transparent 4px, transparent 8px)",
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

            {/* NOW badge — slides along above the rail */}
            <div
              ref={nowBadgeRef}
              className="absolute flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[10.5px] whitespace-nowrap"
              style={{
                top: "calc(50% - 46px)",
                left: 0,
                transform: "translateX(0)",
                borderColor: "rgba(243,215,122,0.4)",
                background: "rgba(243,215,122,0.06)",
              }}
            >
              <div className="w-1 h-1 rounded-full" style={{ background: "#f3d77a" }} />
              <span ref={nowLabelRef} style={{ color: "#f3d77a" }}>NOW · T−3s</span>
            </div>

            {/* Glow rings */}
            <div ref={shieldGlowRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(122,240,168,0.18) 0%, transparent 70%)", opacity: 0 }} />
            <div ref={blockGlowRef}  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(243,215,122,0.22) 0%, transparent 70%)", opacity: 0 }} />

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
                  stroke="#f3d77a" strokeWidth="2.2" fill="none"
                  strokeLinecap="round" style={{ opacity: 0 }}
                />
              </svg>
            </div>

            {/* TX pill */}
            <div
              ref={pillRef}
              className="absolute top-[calc(50%-14px)] flex items-center gap-2 px-3 rounded-full border border-white/25 bg-white/[0.06] font-mono text-[11.5px] text-zinc-200"
              style={{ left: 0, width: 140, height: 28 }}
            >
              <div className="w-[8px] h-[8px] rounded-full bg-sky shrink-0" />
              tx · 5.0 SOL
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

      <CodeCard filename="policy::NotBefore" accent="#f3d77a">
        <span className="text-purple-300">trana</span>{"::"}<span className="text-white">enforce</span>
        {"(ctx, "}<span className="text-purple-300">Policy</span>{"::"}<span className="text-zinc-200">NotBefore</span>{" {\n"}
        {"  not_before: "}<span className="text-orange-300">1_746_057_600</span>
        <span className="text-zinc-500 italic">{" // unix ts"}</span>{",\n})?;"}
      </CodeCard>
    </section>
  )
}
