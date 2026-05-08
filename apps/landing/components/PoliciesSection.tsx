// § 03 — Guard's Ruleset: 4 policy cards

import Link from "next/link"

const POLICIES = [
  {
    name: "policy::Require",
    tag:  "unconditional gate",
    accentKey: "lime",
    desc: "Requires a fresh passkey assertion before execution. No proof, no instruction. The strongest guarantee Trana ships.",
    config: [
      { k: "credential", v: "P-256 WebAuthn" },
      { k: "binding   ", v: "tx-hash" },
      { k: "on_fail   ", v: "REVERT(0xRequire)" },
    ],
  },
  {
    name: "policy::Limit",
    tag:  "amount ceiling",
    accentKey: "azure",
    desc: "Caps SOL or SPL transfers per instruction. Below the threshold, no proof needed. Above it, the gate engages.",
    config: [
      { k: "ceiling   ", v: "10.000 SOL" },
      { k: "scope     ", v: "per-instruction" },
      { k: "on_breach ", v: "escalate → Require" },
    ],
  },
  {
    name: "policy::NotBefore",
    tag:  "time lock",
    accentKey: "amber",
    desc: "Locks the gate until slot N. Unlock windows, vesting cliffs, delayed admin actions — enforced by the cluster clock.",
    config: [
      { k: "unlock    ", v: "slot 317_500_000" },
      { k: "eta       ", v: "~ 36h 14m" },
      { k: "on_fail   ", v: "REVERT(0xTooEarly)" },
    ],
  },
  {
    name: "policy::NotAfter",
    tag:  "automatic sunset",
    accentKey: "plasma",
    desc: "Expires the gate at slot N. Session keys, time-boxed approvals, revocable delegation — sunsets without a transaction.",
    config: [
      { k: "expiry    ", v: "slot 317_412_900" },
      { k: "remaining ", v: "3_679 slots" },
      { k: "on_fail   ", v: "REVERT(0xExpired)" },
    ],
  },
] as const

const ACCENT: Record<string, string> = {
  lime:   "var(--lime)",
  azure:  "var(--azure)",
  amber:  "var(--amber)",
  plasma: "var(--plasma)",
}

export function PoliciesSection() {
  return (
    <section id="policies" className="relative border-b py-16 md:py-24" style={{ borderColor: "var(--rule)" }}>
      <div className="sec-wrap">

        <div className="sec-header">
          <div className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span style={{ color: "var(--bone-2)" }}>§ 03</span> THE GUARD&apos;S RULESET
          </div>
          <div>
            <h2 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance" style={{ fontSize: "clamp(34px,4.4vw,56px)", color: "var(--bone)" }}>
              Four primitives.<br /><em>Composable</em> at the instruction level.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.55] font-light max-w-[640px]" style={{ color: "var(--bone-2)" }}>
              Each policy is a firewall rule. Stack them, branch them, sunset them.
              Every evaluation happens on-chain, every block.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 border" style={{ borderColor: "var(--rule)" }}>
          {POLICIES.map((p, i) => {
            const accent = ACCENT[p.accentKey]
            // Mobile (1-col): items 0-2 get bottom border, item 3 gets none.
            // Desktop (2-col): left column gets right border; top row gets bottom border.
            const borderCls = [
              "border-b sm:border-r",          // 0: top-left
              "border-b",                       // 1: top-right
              "border-b sm:border-b-0 sm:border-r", // 2: bottom-left
              "",                               // 3: bottom-right
            ][i]
            return (
              <div
                key={p.name}
                className={`relative flex flex-col gap-[18px] p-7 ${borderCls}`}
                style={{ borderColor: "var(--rule)" }}
              >
                {/* Status dot */}
                <div className="absolute top-3 right-3 w-[6px] h-[6px] rounded-full" style={{ background: accent, boxShadow: `0 0 0 4px ${accent}1a` }} />

                <header className="flex items-baseline gap-[14px]">
                  <span className="font-mono text-[18px] font-medium tracking-[0.04em]" style={{ color: "var(--bone)" }}>{p.name}</span>
                  <span className="ml-auto font-mono text-[9.5px] tracking-[0.2em] uppercase" style={{ color: accent }}>{p.tag}</span>
                </header>

                <p className="text-[15px] leading-[1.5] font-light max-w-[38ch]" style={{ color: "var(--bone-2)" }}>{p.desc}</p>

                <div className="mt-auto border-t pt-[14px] flex flex-col gap-2" style={{ borderTop: "1px dashed var(--rule)" }}>
                  <div className="font-mono text-[11.5px] leading-[1.7]" style={{ color: "var(--bone-3)" }}>
                    {p.config.map(r => (
                      <div key={r.k}>
                        <span style={{ color: "var(--bone-4)" }}>{r.k}</span>
                        {" = "}
                        <span style={{ color: accent }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/docs/quickstart" className="inline-flex items-center gap-2 self-start font-mono text-[10.5px] tracking-[0.16em] uppercase mt-1.5 transition-colors group" style={{ color: "var(--bone-3)" }}>
                    <span>View spec</span>
                    <span className="transition-transform group-hover:translate-x-[3px]">→</span>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}
