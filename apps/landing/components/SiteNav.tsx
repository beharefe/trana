"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { TranaWordmark } from "./Logo"

const NAV_LINKS = [
  { href: "#how",      label: "How it works", sectionId: "how"      },
  { href: "#policies", label: "Policies",      sectionId: "policies" },
  { href: "#code",     label: "Integrate",     sectionId: "code"     },
  { href: "#trust",    label: "Trust",         sectionId: "trust"    },
  { href: "/try",      label: "/try",          sectionId: null       },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)
  const [activeHref, setActiveHref] = useState<string | null>(null)
  const pathname = usePathname()

  // Route-based active for /try; IntersectionObserver for section links on homepage
  useEffect(() => {
    if (pathname === "/try") { setActiveHref("/try"); return }

    const sectionIds = NAV_LINKS.map(n => n.sectionId).filter(Boolean) as string[]
    const ratios = new Map<string, number>()

    const pick = () => {
      let best: string | null = null, top = 0
      ratios.forEach((r, id) => { if (r > top) { top = r; best = id } })
      setActiveHref(best ? `#${best}` : null)
    }

    const observers = sectionIds.flatMap(id => {
      const el = document.getElementById(id)
      if (!el) return []
      const obs = new IntersectionObserver(
        ([entry]) => {
          entry.isIntersecting ? ratios.set(id, entry.intersectionRatio) : ratios.delete(id)
          pick()
        },
        { rootMargin: "-25% 0px -25% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
      )
      obs.observe(el)
      return [obs]
    })

    return () => observers.forEach(o => o.disconnect())
  }, [pathname])

  const isActive = (href: string) => activeHref === href

  // Anchor links only work on the homepage; prefix with / elsewhere
  const resolvedHref = (href: string) =>
    href.startsWith("/") || pathname === "/" ? href : `/${href}`

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b"
        style={{ borderColor: "var(--rule)", background: "rgba(10,10,11,0.92)", backdropFilter: "blur(10px)" }}
      >
        <div className="sec-wrap flex items-center h-[60px]">

          {/* Mark */}
          <Link href="/" className="flex items-center shrink-0 mr-8">
            <TranaWordmark size="22px" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-[26px]">
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={resolvedHref(href)}
                  className="relative font-mono text-[11.5px] tracking-[0.14em] uppercase transition-colors"
                  style={{ color: active ? "var(--bone)" : "var(--bone-3)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--bone)")}
                  onMouseLeave={e => (e.currentTarget.style.color = active ? "var(--bone)" : "var(--bone-3)")}
                >
                  {active && (
                    <span
                      className="absolute inset-x-0 pointer-events-none"
                      style={{ top: "50%", height: 1.5, background: "var(--lime)", transform: "translateY(-50%)" }}
                      aria-hidden
                    />
                  )}
                  {label}
                </Link>
              )
            })}
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
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={resolvedHref(href)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 py-[13px] border-b font-mono text-[12px] tracking-[0.14em] uppercase"
                  style={{ borderColor: "var(--rule)", color: active ? "var(--lime)" : "var(--bone-2)" }}
                >
                  <span
                    className="w-[5px] h-[5px] rounded-full shrink-0"
                    style={{ background: active ? "var(--lime)" : "var(--bone-5)" }}
                  />
                  {label}
                </Link>
              )
            })}
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
