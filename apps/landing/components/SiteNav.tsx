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
              const isTry = href === "/try"
              return (
                <Link
                  key={href}
                  href={resolvedHref(href)}
                  className="relative font-mono text-[11.5px] tracking-[0.14em] uppercase transition-colors"
                  style={{
                    color: isTry ? "var(--lime)" : active ? "var(--bone)" : "var(--bone-3)",
                    fontWeight: isTry ? 600 : undefined,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = isTry ? "var(--lime)" : "var(--bone)")}
                  onMouseLeave={e => (e.currentTarget.style.color = isTry ? "var(--lime)" : active ? "var(--bone)" : "var(--bone-3)")}
                >
                  {active && !isTry && (
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
            {/* Docs link */}
            <Link
              href="/docs"
              className="hidden sm:flex items-center gap-2 h-8 px-[14px] font-mono text-[11px] tracking-[0.14em] uppercase transition-all"
              style={{ color: "var(--bone-2)", border: "1px solid var(--rule-2)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-3)"; (e.currentTarget as HTMLElement).style.color = "var(--bone)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-2)"; (e.currentTarget as HTMLElement).style.color = "var(--bone-2)" }}
            >
              Docs
            </Link>

            {/* GitHub link — desktop only */}
            <a
              href="https://github.com/beharefe/trana-guard"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 h-8 px-[14px] font-mono text-[11px] tracking-[0.14em] uppercase transition-all"
              style={{ color: "var(--bone-2)", border: "1px solid var(--rule-2)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-3)"; (e.currentTarget as HTMLElement).style.color = "var(--bone)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-2)"; (e.currentTarget as HTMLElement).style.color = "var(--bone-2)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 19c-4 1-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>
              </svg>
              <span>GitHub</span>
            </a>

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
              href="/docs"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 py-[13px] border-b font-mono text-[12px] tracking-[0.14em] uppercase"
              style={{ borderColor: "var(--rule)", color: "var(--bone-2)" }}
            >
              <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "var(--bone-5)" }} />
              Docs
            </Link>
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
