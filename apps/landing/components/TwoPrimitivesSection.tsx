// § 01 — Two Primitives

export function TwoPrimitivesSection() {
  return (
    <section id="primitives" className="relative border-b py-20 md:py-24" style={{ borderColor: "var(--rule)" }}>
      <div className="sec-wrap">

        {/* Section header */}
        <div className="sec-header">
          <div className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span style={{ color: "var(--bone-2)" }}>§ 01</span> THE ARCHITECTURE
          </div>
          <div>
            <h2 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance" style={{ fontSize: "clamp(34px,4.4vw,56px)", color: "var(--bone)" }}>
              Two primitives.<br />One <em>authorization layer</em>.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.55] font-light max-w-[640px]" style={{ color: "var(--bone-2)" }}>
              Guard secures <em>what can execute</em>. Authority secures <em>who can authorize</em>.
              Together they cover every privileged action on Solana — from a custom withdraw
              to a program upgrade.
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <GuardCard />
          <AuthorityCard />
        </div>

      </div>
    </section>
  )
}

function GuardCard() {
  return (
    <article className="relative flex flex-col border p-8 pb-7" style={{ borderColor: "var(--rule-2)", background: "linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%)" }}>
      {/* Corner ticks — lime */}
      <div className="absolute top-[-1px] left-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderTop: "1px solid var(--lime)", borderLeft: "1px solid var(--lime)" }} />
      <div className="absolute bottom-[-1px] right-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderBottom: "1px solid var(--lime)", borderRight: "1px solid var(--lime)" }} />

      <div className="flex items-center gap-[14px] mb-6">
        <div className="w-[38px] h-[38px] flex items-center justify-center" style={{ border: "1px solid rgba(198,255,58,0.35)", color: "var(--lime)", background: "rgba(198,255,58,0.06)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3 4 6v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V6l-8-3Z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: "var(--bone-3)" }}>
          PROGRAM 1 · <span className="font-mono normal-case" style={{ color: "var(--bone-2)", letterSpacing: 0 }}>trana_guard</span>
        </span>
      </div>

      <h3 className="font-serif font-normal text-[44px] leading-none tracking-[-0.02em] mb-2.5" style={{ color: "var(--bone)" }}>Guard</h3>
      <p className="text-[15.5px] leading-[1.55] mb-6 max-w-[38ch] font-light" style={{ color: "var(--bone-2)" }}>
        Policy-gated instructions inside programs you own.
      </p>

      <div className="border-t mb-6" style={{ borderColor: "var(--rule)" }}>
        {[
          { k: "Code change", v: "3 accounts · 1 CPI" },
          { k: "Best for",    v: "Custom logic, conditional, embedded" },
          { k: "Surface",     v: "Withdraw, mint-by-rule, admin actions" },
        ].map(row => (
          <div key={row.k} className="grid gap-4 py-3 border-b text-[13px] leading-relaxed" style={{ gridTemplateColumns: "130px 1fr", borderColor: "var(--rule)" }}>
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase font-medium pt-[2px]" style={{ color: "var(--bone-3)" }}>{row.k}</span>
            <span style={{ color: "var(--bone)" }}>{row.v}</span>
          </div>
        ))}
      </div>

      <pre className="font-mono text-[12.5px] leading-[1.65] border p-[18px] mb-[18px] overflow-x-auto" style={{ background: "var(--ink)", borderColor: "var(--rule)", color: "var(--bone-2)", whiteSpace: "pre" }}>
        <span style={{ color: "var(--lime)" }}>use</span>{" "}<span style={{ color: "var(--bone)" }}>trana_guard</span>::cpi::&#123;<span style={{ color: "var(--bone)" }}>enforce</span>&#125;;{"\n\n"}
        <span style={{ display: "block", background: "rgba(198,255,58,0.05)", borderLeft: "1px solid var(--lime)", paddingLeft: "12px", marginLeft: "-12px", paddingBlock: "4px" }}>
          <span style={{ color: "var(--bone)" }}>trana_guard::cpi::enforce</span>({"\n"}
          {"    "}ctx.<span style={{ color: "var(--bone)" }}>trana_ctx</span>(),{"\n"}
          {"    "}<span style={{ color: "var(--bone)" }}>Policy</span>::<span style={{ color: "var(--plasma)" }}>Require</span>,{"\n"}
          {")?;"}
        </span>
        {"\n\n"}ctx.accounts.vault.<span style={{ color: "var(--bone)" }}>withdraw</span>(amount)?;
      </pre>

      <p className="flex items-center gap-[10px] font-mono text-[11px] leading-[1.4] mt-auto pt-1.5" style={{ color: "var(--bone-3)" }}>
        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "var(--lime)", boxShadow: "0 0 0 3px rgba(198,255,58,0.12)" }} />
        Reverts at the instruction boundary on missing proof.
      </p>
    </article>
  )
}

function AuthorityCard() {
  return (
    <article className="relative flex flex-col border p-8 pb-7" style={{ borderColor: "var(--rule-2)", background: "linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%)" }}>
      {/* Corner ticks — plasma */}
      <div className="absolute top-[-1px] left-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderTop: "1px solid var(--plasma)", borderLeft: "1px solid var(--plasma)" }} />
      <div className="absolute bottom-[-1px] right-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderBottom: "1px solid var(--plasma)", borderRight: "1px solid var(--plasma)" }} />

      <div className="flex items-center gap-[14px] mb-6">
        <div className="w-[38px] h-[38px] flex items-center justify-center" style={{ border: "1px solid rgba(255,107,72,0.35)", color: "var(--plasma)", background: "rgba(255,107,72,0.06)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="10" width="16" height="10" rx="1.5"/>
            <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
            <circle cx="12" cy="15" r="1.2"/>
          </svg>
        </div>
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: "var(--bone-3)" }}>
          PROGRAM 2 · <span className="font-mono normal-case" style={{ color: "var(--bone-2)", letterSpacing: 0 }}>trana_authority</span>
        </span>
      </div>

      <h3 className="font-serif font-normal text-[44px] leading-none tracking-[-0.02em] mb-2.5" style={{ color: "var(--bone)" }}>Authority</h3>
      <p className="text-[15.5px] leading-[1.55] mb-6 max-w-[38ch] font-light" style={{ color: "var(--bone-2)" }}>
        Wraps any transferable authority — for code you don&apos;t own.
      </p>

      <div className="border-t mb-6" style={{ borderColor: "var(--rule)" }}>
        {[
          { k: "Code change", v: <><span className="font-mono font-semibold tracking-[0.04em]" style={{ color: "var(--lime)" }}>zero</span> · transfer authority to PDA</> },
          { k: "Best for",    v: "Upgrade, mint, freeze, admin keys" },
          { k: "Surface",     v: "BPF Loader, SPL Token, any PDA" },
        ].map((row, i) => (
          <div key={i} className="grid gap-4 py-3 border-b text-[13px] leading-relaxed" style={{ gridTemplateColumns: "130px 1fr", borderColor: "var(--rule)" }}>
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase font-medium pt-[2px]" style={{ color: "var(--bone-3)" }}>{row.k}</span>
            <span style={{ color: "var(--bone)" }}>{row.v}</span>
          </div>
        ))}
      </div>

      <pre className="font-mono text-[12.5px] leading-[1.65] border p-[18px] mb-[18px] overflow-x-auto" style={{ background: "var(--ink)", borderColor: "var(--rule)", color: "var(--bone-2)", whiteSpace: "pre" }}>
        <span style={{ color: "var(--bone-4)", fontStyle: "italic" }}># transfer real authority to a Trana PDA — once</span>{"\n"}
        <span style={{ color: "var(--lime)" }}>solana program</span>{" set-upgrade-authority "}
        <span style={{ color: "var(--bone)" }}>$PROGRAM</span>{" \\\n  --new-upgrade-authority "}
        <span style={{ color: "var(--bone)" }}>$TRANA_PDA</span>{"\n\n"}
        <span style={{ color: "var(--bone-4)", fontStyle: "italic" }}># now: leaked key cannot upgrade. only the PDA can.</span>{"\n"}
        <span style={{ color: "var(--bone-4)", fontStyle: "italic" }}>#  and the PDA only signs after passkey proof.</span>
      </pre>

      <p className="flex items-center gap-[10px] font-mono text-[11px] leading-[1.4] mt-auto pt-1.5" style={{ color: "var(--bone-3)" }}>
        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "var(--plasma)", boxShadow: "0 0 0 3px rgba(255,107,72,0.12)" }} />
        Even the leaked admin key can request — not authorize.
      </p>
    </article>
  )
}
