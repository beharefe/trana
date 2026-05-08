import { ArrowDownToLine, ArrowUpFromLine, Cpu } from "lucide-react"

type DemoCard = {
  id:       "deposit" | "withdraw" | "upgrade"
  icon:     React.ReactNode
  title:    string
  subtitle: string
  tag:      string
}

const CARDS: DemoCard[] = [
  {
    id:       "deposit",
    icon:     <ArrowDownToLine size={16} />,
    title:    "Deposit",
    subtitle: "Top up the shared pool",
    tag:      "No passkey required",
  },
  {
    id:       "withdraw",
    icon:     <ArrowUpFromLine size={16} />,
    title:    "Withdraw",
    subtitle: "Try to drain the pool",
    tag:      "3 policies · discover them",
  },
  {
    id:       "upgrade",
    icon:     <Cpu size={16} />,
    title:    "Upgrade",
    subtitle: "Try to patch the program",
    tag:      "Authority PDA primitive",
  },
]

type Props = {
  /** active card id — pass from parent state later */
  active?: DemoCard["id"]
}

export function DemoCards({ active = "withdraw" }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CARDS.map((card) => {
        const isActive = card.id === active
        return (
          /* button → add onClick handler from parent */
          <button
            key={card.id}
            type="button"
            className={[
              "flex flex-col gap-3 p-4 rounded-xl border text-left w-full transition-all",
              isActive
                ? "border-accent/35 bg-accent/[0.04]"
                : "border-white/[0.08] bg-card hover:border-white/[0.16]",
            ].join(" ")}
          >
            <span className={isActive ? "text-accent" : "text-faint"}>
              {card.icon}
            </span>
            <div>
              <div className="font-medium text-[14px] text-ink tracking-[-0.01em]">{card.title}</div>
              <div className="text-[12.5px] text-muted mt-0.5 leading-relaxed">{card.subtitle}</div>
            </div>
            <span className="self-start px-2 py-0.5 rounded-full border border-white/[0.10] font-mono text-[10px] tracking-[0.04em] text-faint">
              {card.tag}
            </span>
          </button>
        )
      })}
    </div>
  )
}
