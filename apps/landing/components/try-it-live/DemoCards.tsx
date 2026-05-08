import Link from "next/link"
import { ArrowDownToLine, ArrowUpFromLine, Settings2 } from "lucide-react"

const CARDS = [
  {
    id:      "deposit",
    href:    "/docs/try-it-live/deposit",
    icon:    <ArrowDownToLine size={18} />,
    title:   "Deposit",
    sub:     "Top up the shared pool",
    tag:     "No passkey required",
    tagColor: "border-white/[0.14] text-faint",
  },
  {
    id:       "withdraw",
    href:     "/docs/try-it-live/withdraw",
    icon:     <ArrowUpFromLine size={18} />,
    title:    "Withdraw",
    sub:      "Try to drain the pool",
    tag:      "3 policies — discover them",
    tagColor: "border-accent/35 text-accent",
  },
  {
    id:       "upgrade",
    href:     "/docs/try-it-live/upgrade",
    icon:     <Settings2 size={18} />,
    title:    "Program upgrade",
    sub:      "Try to patch the program",
    tag:      "Authority PDA primitive",
    tagColor: "border-[#ff5b1f]/35 text-[#ff5b1f]",
  },
] as const

type CardId = typeof CARDS[number]["id"]

export function DemoCards({ active }: { active: CardId }) {
  return (
    <div className="not-prose grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {CARDS.map((c) => {
        const isActive = c.id === active
        return (
          <Link
            key={c.id}
            href={c.href}
            className={[
              "flex flex-col gap-4 p-5 rounded-xl border transition-all no-underline",
              isActive
                ? "border-accent/35 bg-accent/[0.03]"
                : "border-white/[0.08] bg-card hover:border-white/[0.16]",
            ].join(" ")}
          >
            <span className={isActive ? "text-accent" : "text-faint"}>
              {c.icon}
            </span>
            <div>
              <div className="font-semibold text-[14px] text-ink tracking-[-0.01em]">{c.title}</div>
              <div className="text-[12.5px] text-muted mt-1 leading-relaxed">{c.sub}</div>
            </div>
            <span className={`self-start px-2.5 py-1 rounded-full border font-mono text-[9px] tracking-[0.08em] uppercase ${c.tagColor}`}>
              {c.tag}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
