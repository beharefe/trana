/**
 * Trana logo system — mirroring the brand HTML spec exactly.
 *
 * The mark is the literal lowercase `t` from Space Grotesk 600 with a
 * lime (#c6ff3a) crossbar. Crossbar is a child <span> positioned
 * absolutely — same geometry as the ::after pseudo-element in the
 * brand HTML (left -0.18em, right -0.04em for wordmark / -0.40em for
 * icon-only, top 0.30em, height 0.07em).
 */

import type { CSSProperties } from "react"

// ── Shared crossbar bar ───────────────────────────────────────────────────────

type BarVariant = "wordmark" | "mark"

function CrossBar({ variant = "wordmark", color = "#c6ff3a" }: { variant?: BarVariant; color?: string }) {
  const style: CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    left:   "-0.18em",
    right:  variant === "mark" ? "-0.40em" : "-0.04em",
    top:    "0.30em",
    height: "0.075em",
    background: color,
  }
  return <span aria-hidden style={style} />
}

// ── Icon mark — standalone `t` with wide crossbar ────────────────────────────

export function TranaMark({
  size      = "1em",
  barColor  = "#c6ff3a",
  textColor = "#ebe8e0",
  className,
}: {
  size?:      string | number
  barColor?:  string
  textColor?: string
  className?: string
}) {
  return (
    <span
      className={`relative inline-block font-sans font-semibold leading-none select-none ${className ?? ""}`}
      style={{ fontSize: size, letterSpacing: "-0.05em", color: textColor }}
    >
      t
      <CrossBar variant="mark" color={barColor} />
    </span>
  )
}

// ── Wordmark — `trana` with crossbar on the `t` ──────────────────────────────

export function TranaWordmark({
  size      = "1em",
  barColor  = "#c6ff3a",
  textColor = "#ebe8e0",
  className,
}: {
  size?:      string | number
  barColor?:  string
  textColor?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-baseline font-sans font-semibold leading-none select-none ${className ?? ""}`}
      style={{ fontSize: size, letterSpacing: "-0.05em", color: textColor }}
    >
      <span className="relative">
        t
        <CrossBar variant="wordmark" color={barColor} />
      </span>
      rana
    </span>
  )
}
