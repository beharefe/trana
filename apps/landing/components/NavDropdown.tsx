"use client"

import Link from "next/link"
import { useState, useRef, useEffect } from "react"

interface Item {
  href: string
  label: string
  description?: string
}

interface Props {
  label: string
  items: Item[]
}

export function NavDropdown({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-border bg-bg shadow-lg overflow-hidden z-50">
          {items.map(({ href, label: itemLabel, description }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex flex-col gap-0.5 px-4 py-3 hover:bg-card transition-colors group"
            >
              <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors">
                {itemLabel}
              </span>
              {description && (
                <span className="text-xs text-faint leading-snug">{description}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
