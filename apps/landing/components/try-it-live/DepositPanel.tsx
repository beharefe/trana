"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

export function DepositPanel() {
  const [amount, setAmount] = useState(0.5)
  const [done,   setDone]   = useState(false)

  return (
    <div className="not-prose rounded-xl border border-white/[0.08] bg-card overflow-hidden">

      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
        <span className="font-mono text-[13px] font-medium text-ink">Deposit · add to the pool</span>
        <span className="font-mono text-[11px] text-faint">
          policy in play <span className="text-accent">None</span>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/[0.06]">

        {/* left */}
        <div className="p-5 bg-card space-y-5">
          <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase">Amount</div>

          <div className="flex items-baseline gap-2 px-4 py-3 rounded-xl border border-white/[0.10] bg-bg">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value))}
              className="flex-1 bg-transparent outline-none font-sans font-semibold text-[28px] tracking-[-0.03em] text-ink w-0 min-w-0"
            />
            <span className="font-mono text-[13px] text-faint shrink-0">SOL</span>
          </div>

          <div className="flex gap-2">
            {[0.1, 0.5, 1.0, 2.0].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v)}
                className={[
                  "flex-1 py-2 rounded-lg border font-mono text-[11px] transition-colors",
                  amount === v
                    ? "border-accent/35 text-accent bg-accent/[0.04]"
                    : "border-white/[0.10] text-faint hover:text-ink",
                ].join(" ")}
              >
                {v}
              </button>
            ))}
          </div>

          {/* onClick → wallet + RPC */}
          <button
            type="button"
            onClick={() => setDone(true)}
            className="w-full py-3 rounded-xl font-mono font-semibold text-[13px] tracking-[0.08em] text-bg bg-accent hover:brightness-110 transition-all uppercase"
          >
            Deposit
          </button>

          <p className="font-mono text-[11px] text-faint">
            Anyone can deposit. No passkey required.
          </p>
        </div>

        {/* right */}
        <div className="p-5 bg-card space-y-6">
          <div>
            <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-1.5">Last result</div>
            {done
              ? <div className="flex items-center gap-1.5 font-mono text-[12px] text-accent"><CheckCircle2 size={12} /> Deposit confirmed</div>
              : <div className="font-mono text-[12px] text-faint">Awaiting deposit</div>
            }
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="space-y-3">
            <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase">Why no passkey?</div>
            <p className="font-mono text-[11px] text-faint leading-relaxed">
              Deposits are open to everyone. The vault is a shared pool — anyone can add funds.
              The passkey only gates <span className="text-ink">withdrawals</span> above the threshold.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
