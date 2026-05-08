"use client"

import { useState } from "react"
import Link from "next/link"

const NAV_LINKS = [
  { href: "#how",      label: "How it works" },
  { href: "#policies", label: "Policies" },
  { href: "#code",     label: "Integrate" },
  { href: "#trust",    label: "Trust" },
  { href: "/try",      label: "/try" },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b"
        style={{ borderColor: "var(--rule)", background: "rgba(10,10,11,0.92)", backdropFilter: "blur(10px)" }}
      >
        <div className="sec-wrap flex items-center h-[60px]">

          {/* Mark */}
          <Link href="/" className="flex items-center gap-[10px] shrink-0 mr-8">
            <NestedSquareMark />
            <span className="font-serif text-[22px] leading-none tracking-[-0.01em]" style={{ color: "var(--bone)" }}>
              trana
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-[26px]">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="font-mono text-[11.5px] tracking-[0.14em] uppercase transition-colors"
                style={{ color: "var(--bone-3)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--bone)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--bone-3)")}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-[10px]">
            {/* Live pill */}
            <span
              className="hidden sm:inline-flex items-center gap-2 h-7 px-3 rounded-full font-mono text-[10.5px] tracking-[0.18em] uppercase"
              style={{ color: "var(--lime)", border: "1px solid rgba(198,255,58,0.30)", background: "rgba(198,255,58,0.05)" }}
            >
              <span className="relative w-[6px] h-[6px] rounded-full bg-[var(--lime)] animate-pulse-dot" />
              <span>Live · devnet</span>
            </span>

            {/* CTA — desktop only */}
            <Link
              href="/try"
              className="hidden sm:flex items-center gap-2 h-8 px-[14px] font-mono text-[11px] tracking-[0.14em] uppercase transition-all"
              style={{ color: "var(--bone-2)", border: "1px solid var(--rule-2)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-3)"; (e.currentTarget as HTMLElement).style.color = "var(--bone)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-2)"; (e.currentTarget as HTMLElement).style.color = "var(--bone-2)" }}
            >
              <span>Open /try</span>
              <span>→</span>
            </Link>

            {/* Hamburger */}
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden flex items-center justify-center w-8 h-8 cursor-pointer shrink-0"
              style={{ border: "1px solid var(--rule-2)", color: "var(--bone-2)", background: "transparent" }}
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
                  <path d="M1 1 11 11M11 1 1 11"/>
                </svg>
              ) : (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
                  <path d="M0 1h14M0 5h14M0 9h14"/>
                </svg>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile nav dropdown */}
      {open && (
        <div
          className="md:hidden fixed inset-x-0 top-[60px] z-20 border-b"
          style={{ background: "var(--ink-2)", borderColor: "var(--rule)" }}
        >
          <nav className="sec-wrap flex flex-col py-3">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 py-[13px] border-b font-mono text-[12px] tracking-[0.14em] uppercase"
                style={{ borderColor: "var(--rule)", color: "var(--bone-2)" }}
              >
                <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "var(--bone-5)" }} />
                {label}
              </Link>
            ))}
            <Link
              href="/try"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 mt-4 mb-2 h-11 font-mono text-[12px] tracking-[0.14em] uppercase"
              style={{ background: "var(--lime)", color: "var(--ink)" }}
            >
              Try on devnet →
            </Link>
          </nav>
        </div>
      )}
    </>
  )
}

function NestedSquareMark() {
  return (
    <span className="relative inline-block w-[22px] h-[22px] shrink-0" style={{ border: "1.5px solid var(--bone)" }}>
      <span className="absolute" style={{ inset: "4px", border: "1.5px solid var(--lime)" }} />
    </span>
  )
}
