"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TranaWordmark } from "./Logo"

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav
      className={[
        "fixed top-0 left-0 right-0 z-50",
        "flex items-center justify-between px-7 py-[17px]",
        "backdrop-blur-[14px] transition-[background,border-color] duration-200",
        scrolled
          ? "border-b border-white/[0.08] bg-[#08090b]/85"
          : "border-b border-transparent bg-gradient-to-b from-[#08090b]/75 to-transparent",
      ].join(" ")}
    >
      <Link href="/" className="flex items-center">
        <TranaWordmark size="md" />
      </Link>

      <div className="flex items-center gap-[26px] text-[13.5px] text-muted">
        <Link href="#policies" className="hidden sm:block hover:text-ink transition-colors">
          Policies
        </Link>
        <Link href="/docs/quickstart" className="hidden sm:block hover:text-ink transition-colors">
          Docs
        </Link>
        <a
          href="https://github.com/beharefe/trana-guard"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          GitHub
        </a>
        <a
          href="#waitlist"
          className="flex items-center gap-1.5 px-[13px] py-[7px] rounded-full border border-white/[0.14] text-[13px] text-ink hover:bg-white/[0.06] hover:border-white/[0.28] transition-all"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_#7af0a8]" />
          Mainnet waitlist
        </a>
      </div>
    </nav>
  )
}
