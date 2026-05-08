// ── Trana mark ────────────────────────────────────────────────────────────────
//
// The T mark: wide crossbar, centred stem, pointed bottom.
// The pointed stem references key-bit / shield-point — guard without being
// literal about it. Reads cleanly from 12 px to 512 px.
//
// Variants
//   TranaIcon        — bare T path, inherits or accepts a color
//   TranaIconBadge   — T on mint-green rounded-square (app icon, OG)
//   TranaWordmark    — icon + "Trana" serif (nav, hero)

// ── T path on a 40 × 40 viewBox ──────────────────────────────────────────────
//   crossbar   : x 3–37  y 7–15  (34 w × 8 h)
//   stem       : x 15–25 y 15–30 (10 w × 15 h, centred at 20)
//   point      : (15,30) → (20,37) → (25,30)
const T_PATH = "M3,7 H37 V15 H25 V30 L20,37 L15,30 V15 H3 Z"

// ── Bare icon — composable ────────────────────────────────────────────────────

export function TranaIcon({
  size      = 28,
  color     = "currentColor",
  glow      = false,
  className,
}: {
  size?:      number
  color?:     string
  glow?:      boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 6px rgba(122,240,168,0.55))" } : undefined}
    >
      <path d={T_PATH} fill={color} />
    </svg>
  )
}

// ── Badge — icon on mint square, for app icon / favicon contexts ──────────────

export function TranaIconBadge({ size = 32 }: { size?: number }) {
  const rx = Math.round(size * 0.225) // ~22% corner radius — matches iOS icon
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <rect width="40" height="40" rx={rx * 40 / size} fill="#7af0a8" />
      <path d={T_PATH} fill="#08090b" />
    </svg>
  )
}

// ── Wordmark — icon + "Trana" logotype ───────────────────────────────────────

type WordmarkSize = "sm" | "md" | "lg"

const SCALE: Record<WordmarkSize, { icon: number; text: string; gap: string }> = {
  sm: { icon: 18, text: "text-[13px]",  gap: "gap-2"   },
  md: { icon: 22, text: "text-[15px]",  gap: "gap-2.5" },
  lg: { icon: 30, text: "text-[21px]",  gap: "gap-3"   },
}

export function TranaWordmark({ size = "md" }: { size?: WordmarkSize }) {
  const s = SCALE[size]
  return (
    <span className={`inline-flex items-center ${s.gap}`}>
      <TranaIcon
        size={s.icon}
        color="#7af0a8"
        glow
      />
      <span
        className={`font-serif tracking-[-0.025em] leading-none text-ink ${s.text}`}
      >
        Trana
      </span>
    </span>
  )
}
