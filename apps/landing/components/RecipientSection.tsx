"use client"

import { useEffect, useRef } from "react"
import type AnimeJS from "animejs"
import { GridBg, CodeCard } from "./Hero"

const ADDR_POOL = ["7Hk2…b3FQ", "aXp9…44Tn", "dQ8r…71Wm", "m4Vj…b2Ck"]

export function RecipientSection() {
  const sectionRef      = useRef<HTMLElement>(null)
  const inboundRef      = useRef<HTMLDivElement>(null)
  const inboundAddrRef  = useRef<HTMLSpanElement>(null)
  const inboundBadgeRef = useRef<HTMLSpanElement>(null)
  const pendingRowRef   = useRef<HTMLDivElement>(null)
  const pendingAddrRef  = useRef<HTMLSpanElement>(null)
  const pendingCkRef    = useRef<HTMLSpanElement>(null)
  const pendingTagRef   = useRef<HTMLSpanElement>(null)
  const countRef        = useRef<HTMLSpanElement>(null)
  const passkeyRef      = useRef<HTMLDivElement>(null)
  const statusDotRef    = useRef<HTMLSpanElement>(null)
  const statusTxtRef    = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    let stopped = false
    let started = false

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true
          runLoop()
        }
      },
      { threshold: 0.35 }
    )
    observer.observe(section)

    async function runLoop() {
      const { default: anime } = await import("animejs") as { default: typeof AnimeJS }
      if (stopped) return

      const inbound      = inboundRef.current!
      const inboundAddr  = inboundAddrRef.current!
      const inboundBadge = inboundBadgeRef.current!
      const pendingRow   = pendingRowRef.current!
      const pendingAddr  = pendingAddrRef.current!
      const pendingCk    = pendingCkRef.current!
      const pendingTag   = pendingTagRef.current!
      const count        = countRef.current!
      const passkey      = passkeyRef.current!
      const dot          = statusDotRef.current!
      const txt          = statusTxtRef.current!

      const setStatus = (label: string, type: "idle" | "block" | "approve") => {
        txt.textContent = label
        const colors = { idle: "#71717a", block: "#b794ff", approve: "#7af0a8" }
        const glows  = { idle: "none", block: "0 0 8px #b794ff", approve: "0 0 8px #7af0a8" }
        dot.style.background = colors[type]
        dot.style.boxShadow  = glows[type]
      }

      const wait = (ms: number) => anime({ targets: {}, duration: ms, easing: "linear" }).finished

      let idx   = 0
      let known = 2

      while (!stopped) {
        const addr = ADDR_POOL[idx % ADDR_POOL.length]
        idx++

        // ── reset ──────────────────────────────────────────────────────
        anime.set(inbound,  { opacity: 0, translateY: -10 })
        anime.set(passkey,  { opacity: 0, translateY: 6 })
        inboundAddr.textContent  = addr
        inboundBadge.textContent = "?"
        inboundBadge.style.color        = "#b794ff"
        inboundBadge.style.background   = "rgba(183,148,255,0.08)"
        inboundBadge.style.borderColor  = "rgba(183,148,255,0.35)"
        pendingAddr.textContent  = addr
        pendingCk.textContent    = "?"
        pendingCk.style.color    = "#71717a"
        pendingTag.textContent   = "incoming"
        pendingTag.style.color   = "#71717a"
        pendingRow.style.opacity      = "0.45"
        pendingRow.style.background   = "transparent"
        pendingRow.style.borderTopColor = "rgba(255,255,255,0.06)"
        known = 2
        count.textContent = "2"
        setStatus("idle", "idle")
        await wait(500)
        if (stopped) break

        // ── inbound address slides in ──────────────────────────────────
        setStatus("incoming · unknown recipient", "idle")
        await anime({ targets: inbound, opacity: 1, translateY: 0, duration: 500, easing: "cubicBezier(.2,.8,.2,1)" }).finished
        await wait(700)
        if (stopped) break

        // ── policy check: not in known set → blocked ───────────────────
        pendingRow.style.opacity      = "1"
        pendingRow.style.background   = "rgba(183,148,255,0.04)"
        pendingRow.style.borderTopColor = "rgba(183,148,255,0.25)"
        pendingTag.textContent = "novel"
        pendingTag.style.color = "#b794ff"
        inboundBadge.textContent    = "!"
        inboundBadge.style.color       = "#b794ff"
        inboundBadge.style.background  = "rgba(183,148,255,0.12)"
        inboundBadge.style.borderColor = "rgba(183,148,255,0.5)"
        setStatus("blocked · novel recipient", "block")
        await wait(1000)
        if (stopped) break

        // ── passkey challenge ──────────────────────────────────────────
        setStatus("passkey · awaiting…", "block")
        await anime({ targets: passkey, opacity: 1, translateY: 0, duration: 500, easing: "cubicBezier(.2,.8,.2,1)" }).finished
        await wait(1300)
        if (stopped) break

        // ── approved: join known set ───────────────────────────────────
        inboundBadge.textContent    = "✓"
        inboundBadge.style.color       = "#7af0a8"
        inboundBadge.style.background  = "rgba(122,240,168,0.08)"
        inboundBadge.style.borderColor = "rgba(122,240,168,0.35)"
        pendingCk.textContent  = "✓"
        pendingCk.style.color  = "#7af0a8"
        pendingTag.textContent = "added"
        pendingTag.style.color = "#7af0a8"
        pendingRow.style.background   = "rgba(122,240,168,0.03)"
        pendingRow.style.borderTopColor = "rgba(122,240,168,0.2)"
        known++
        count.textContent = String(known)
        setStatus("added to known set · ✓", "approve")
        await anime({ targets: passkey, opacity: 0, translateY: 6, duration: 400, easing: "easeInSine" }).finished
        await wait(1400)
        if (stopped) break

        // ── fade out inbound ───────────────────────────────────────────
        await anime({ targets: inbound, opacity: 0, translateY: -8, duration: 400, easing: "easeInSine" }).finished
        setStatus("idle", "idle")
        await wait(600)
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
      id="recipient"
      className="relative min-h-screen px-6 sm:px-12 pt-[120px] pb-[180px] sm:pb-[140px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto mt-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Text */}
          <div className="max-w-[40ch]">
            <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-faint tracking-[0.08em] uppercase px-2.5 py-[5px] border border-white/[0.08] rounded-full bg-white/[0.015]">
              <span className="w-[7px] h-[7px] rounded-full bg-violet shrink-0" style={{ boxShadow: "0 0 10px #b794ff" }} />
              Policy · RecipientNovelty
            </span>
            <h2 className="font-serif text-[clamp(38px,5vw,72px)] leading-[0.98] tracking-[-0.035em] mt-6 mb-[18px] max-w-[18ch] text-balance text-ink">
              Stop{" "}
              <em className="text-violet not-italic">unknown</em>{" "}
              recipients.
            </h2>
            <p className="text-[clamp(16px,1.4vw,20px)] text-muted leading-[1.45] tracking-[-0.005em]">
              First time sending here? Require approval. Trana keeps a
              per-vault recipient set on chain and challenges the user any
              time it grows.
            </p>
          </div>

          {/* Art */}
          <div
            className="relative h-[420px] sm:h-[480px] border border-white/[0.08] rounded-[18px] overflow-hidden"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.02), transparent 70%), #0d0e11" }}
          >
            <span className="absolute top-3.5 left-3.5 flex items-center gap-1.5 font-mono text-[10.5px] text-faint tracking-[0.06em]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet" style={{ boxShadow: "0 0 8px #b794ff" }} />
              policy.recipient_novelty
            </span>

            {/* ── Main content — vertically centered ─────────────────── */}
            <div className="absolute inset-0 flex flex-col items-center justify-center px-7 gap-3">

              {/* Inbound address badge */}
              <div
                ref={inboundRef}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.02] font-mono text-[12px]"
                style={{ opacity: 0 }}
              >
                <div className="flex items-center gap-2.5 text-muted">
                  <span className="text-faint text-[10px] tracking-[0.08em] uppercase">inbound tx → recipient</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span ref={inboundAddrRef} className="text-ink">7Hk2…b3FQ</span>
                  <span
                    ref={inboundBadgeRef}
                    className="w-[20px] h-[20px] rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ color: "#b794ff", background: "rgba(183,148,255,0.08)", borderColor: "rgba(183,148,255,0.35)" }}
                  >?</span>
                </div>
              </div>

              {/* Connector arrow */}
              <div className="flex flex-col items-center gap-0.5 text-faint">
                <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.1)" }} />
                <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden>
                  <path d="M0 0 L4 5 L8 0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Known recipients table */}
              <div className="w-full border border-white/[0.08] rounded-xl overflow-hidden font-mono text-[12px]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.015]">
                  <span className="text-[10.5px] text-faint tracking-[0.08em] uppercase">on-chain · known recipients</span>
                  <span ref={countRef} className="text-faint">2</span>
                </div>
                {/* Known rows */}
                <KnownRow addr="Tr3v…91Ab" />
                <KnownRow addr="9DkW…22Lm" />
                {/* Pending / new row */}
                <div
                  ref={pendingRowRef}
                  className="flex items-center justify-between px-4 py-2.5 transition-colors"
                  style={{ opacity: 0.45, borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span ref={pendingAddrRef} className="text-muted">7Hk2…b3FQ</span>
                    <span ref={pendingTagRef} className="text-[10px] tracking-[0.06em]" style={{ color: "#71717a" }}>incoming</span>
                  </div>
                  <span ref={pendingCkRef} className="text-[13px]" style={{ color: "#71717a" }}>?</span>
                </div>
              </div>

              {/* Passkey pill — sits just below the table */}
              <div
                ref={passkeyRef}
                className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] border border-white/35 bg-white/[0.04] font-mono text-[11.5px] text-ink whitespace-nowrap"
                style={{ opacity: 0 }}
              >
                <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                  <circle cx="5" cy="4" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5 4 L5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                passkey · touch
              </div>

            </div>

            {/* Status */}
            <div className="absolute bottom-[18px] left-[18px] flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em]">
              <span ref={statusDotRef} className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#71717a" }} />
              <span ref={statusTxtRef} className="text-muted">idle</span>
            </div>
          </div>

        </div>
      </div>

      <CodeCard filename="policy::RecipientNovelty" accent="#b794ff">
        <span className="text-purple-300">trana</span>{"::"}<span className="text-white">enforce</span>
        {"(ctx, "}<span className="text-purple-300">Policy</span>{"::"}<span className="text-zinc-200">RecipientNovelty</span>{" {\n"}
        {"  recipient,\n"}
        {"  is_novel: "}<span className="text-orange-300">true</span>{",\n"}
        {"})?;"}
      </CodeCard>
    </section>
  )
}

function KnownRow({ addr }: { addr: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] first:border-t-0 font-mono text-[12px] text-muted">
      <span>{addr}</span>
      <span className="text-accent text-[13px]">✓</span>
    </div>
  )
}
