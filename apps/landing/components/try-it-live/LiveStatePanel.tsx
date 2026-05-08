/** Right-side live state panel — all placeholders, wire RPC later */

type Stat = { label: string; value: React.ReactNode }

function StatRow({ label, value }: Stat) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-1">{label}</div>
      <div className="font-mono text-[13px] text-ink font-medium leading-snug">{value}</div>
    </div>
  )
}

export function LiveStatePanel() {
  return (
    <aside className="shrink-0 w-[220px] xl:w-[240px] space-y-4 sticky top-6 self-start">

      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[0.16em] text-faint uppercase">Live state</span>
        <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.10em] text-accent uppercase">
          <span className="w-1 h-1 rounded-full bg-accent" />
          devnet
        </span>
      </div>

      {/* stats */}
      <div className="space-y-4 p-4 rounded-xl border border-white/[0.08] bg-card">
        <StatRow
          label="Shared vault balance"
          value={<span className="text-[18px] tracking-[-0.02em]">— <span className="text-[11px] font-normal text-faint">SOL</span></span>}
        />
        <StatRow label="Registry nonce"            value="—" />
        <StatRow label="Your deposits this session" value="—" />
        <StatRow label="Last policy triggered"      value="—" />
        <StatRow
          label="Last tx signature"
          value={<span className="text-faint text-[11px]">No transactions yet</span>}
        />
      </div>

      {/* rpc */}
      <div className="p-4 rounded-xl border border-white/[0.08] bg-card space-y-1">
        <div className="font-mono text-[9px] tracking-[0.14em] text-faint uppercase mb-2">RPC endpoint</div>
        <div className="font-mono text-[11px] text-ink">api.devnet.solana.com</div>
        {/* slot → replace with live value */}
        <div className="font-mono text-[10px] text-faint">slot — · refresh 5s</div>
      </div>

    </aside>
  )
}
