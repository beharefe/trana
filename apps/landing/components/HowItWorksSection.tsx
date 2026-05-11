// § 02 — How it works: protocol diagram + 3 callouts

export function HowItWorksSection() {
  return (
    <section id="how" className="relative border-b py-16 md:py-24" style={{ borderColor: "var(--rule)" }}>
      <div className="sec-wrap">

        <div className="sec-header">
          <div className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span style={{ color: "var(--bone-2)" }}>§ 02</span> HOW IT WORKS
          </div>
          <div>
            <h2 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance" style={{ fontSize: "clamp(34px,4.4vw,56px)", color: "var(--bone)" }}>
              A firewall <em>between</em> your<br />instruction and execution.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.55] font-light max-w-[640px]" style={{ color: "var(--bone-2)" }}>
              Guard sits between the transaction and your program logic. Every&nbsp;sensitive&nbsp;instruction evaluates a policy before it can run. No&nbsp;proof,&nbsp;no&nbsp;execution.
              The transaction reverts at the instruction boundary.
            </p>
          </div>
        </div>

        {/* Protocol diagram */}
        <div className="border p-4 sm:p-8 mb-[18px]" style={{ background: "var(--ink-2)", borderColor: "var(--rule)" }}>
          <ProtoStep ix="ix[N−2]" highlight={false}>
            <div className="flex items-center gap-[10px] font-mono text-[13px] mb-1" style={{ color: "var(--bone)" }}>
              <span style={{ color: "var(--azure)" }}>●</span>
              secp256r1::verify
            </div>
            <div className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>native precompile · P-256 webauthn assertion</div>
          </ProtoStep>

          <ProtoStep ix="ix[N−1]" highlight={false}>
            <div className="flex items-center gap-[10px] font-mono text-[13px] mb-1" style={{ color: "var(--bone)" }}>
              <span style={{ color: "var(--bone-3)" }}>●</span>
              trana_guard::record_proof
            </div>
            <div className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>writes proof to sysvar · sibling lookup</div>
          </ProtoStep>

          <ProtoStep ix="ix[N]" highlight={true}>
            <div className="flex items-center gap-[10px] font-mono text-[13px] mb-1" style={{ color: "var(--lime)" }}>
              <span>▶</span>
              YOUR_PROGRAM::action
              <span className="hidden sm:inline font-mono text-[10.5px] tracking-[0.22em] uppercase ml-2" style={{ color: "var(--bone-4)" }}>cpi → guard.enforce()</span>
            </div>
            <div className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>policy::Require · reads sibling proof · verifies binding</div>
          </ProtoStep>

          {/* Fork */}
          <div className="grid items-center gap-[18px] pt-3.5 relative" style={{ gridTemplateColumns: "60px 1fr 1fr" }}>
            <div className="absolute left-[29px] top-[-6px] w-[1px] h-3" style={{ backgroundImage: "linear-gradient(to bottom, var(--rule-3) 50%, transparent 50%)", backgroundSize: "1px 4px" }} />
            <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-right" style={{ color: "var(--bone-2)" }}>eval</div>
            <div className="border p-[14px] flex flex-col gap-1" style={{ borderColor: "rgba(198,255,58,0.30)", background: "rgba(198,255,58,0.02)" }}>
              <div className="font-mono text-[13px]" style={{ color: "var(--lime)" }}>✓ PASS</div>
              <div className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>action executes</div>
            </div>
            <div className="border p-[14px] flex flex-col gap-1" style={{ borderColor: "rgba(255,91,31,0.30)", background: "rgba(255,91,31,0.02)" }}>
              <div className="font-mono text-[13px]" style={{ color: "var(--plasma)" }}>✕ BLOCK</div>
              <div className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>tx reverts</div>
            </div>
          </div>
        </div>

        {/* 3 callouts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
          <Callout label="PROTOCOL NOTE" title={<>Three instructions, <em>one outcome</em>.</>}>
            <p className="m-0 text-[14px] leading-[1.6] font-light" style={{ color: "var(--bone-2)" }}>
              Solana&apos;s secp256r1 verifier is a native precompile, not callable by CPI.
              Guard reads sibling top-level instructions via the Instructions sysvar,
              so the precompile and <span className="font-mono" style={{ color: "var(--bone)" }}>record_proof</span> sit alongside your action in the same transaction.
            </p>
            <div className="mt-[14px] grid gap-2" style={{ gridTemplateColumns: "auto 1fr" }}>
              {[["BINDING", "tx-hash"], ["EXPIRY", "120 slots"], ["NONCE", "monotonic"]].map(([k, v]) => [
                <span key={k + "k"} className="font-mono text-[11.5px]" style={{ color: "var(--bone-4)" }}>{k}</span>,
                <span key={k + "v"} className="font-mono text-[11.5px]" style={{ color: "var(--bone)" }}>{v}</span>,
              ])}
            </div>
          </Callout>

          <Callout label="ENFORCEMENT MODEL" title={<>Signing ≠ <em>authorization</em>.</>}>
            <p className="m-0 text-[14px] leading-[1.6] font-light" style={{ color: "var(--bone-2)" }}>
              A leaked seed can sign anything. A guarded program demands a{" "}
              <span className="font-mono" style={{ color: "var(--bone)" }}>P-256</span> assertion, bound to this transaction, at execution
              time. Funds remain even when the keypair is public.
            </p>
          </Callout>

          <Callout label="WHY NOW · SIMD-0075" title={<>Native <em>secp256r1</em>.</>}>
            <p className="m-0 text-[14px] leading-[1.6] font-light" style={{ color: "var(--bone-2)" }}>
              Solana shipped a P-256 verifier as a native precompile.
              The same curve WebAuthn uses. Passkeys verify on-chain in one instruction.
            </p>
            <div className="mt-[14px] grid gap-2" style={{ gridTemplateColumns: "auto 1fr" }}>
              {[["spec", "SIMD-0075"], ["curve", "secp256r1 / P-256"], ["activated", "2025 · mainnet-beta"], ["author", "Orion"]].map(([k, v]) => [
                <span key={k + "k"} className="font-mono text-[11.5px]" style={{ color: "var(--bone-4)" }}>{k}</span>,
                <span key={k + "v"} className="font-mono text-[11.5px]" style={{ color: "var(--bone)" }}>{v}</span>,
              ])}
            </div>
          </Callout>
        </div>

      </div>
    </section>
  )
}

function ProtoStep({ ix, highlight, children }: { ix: string; highlight: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-[18px] relative py-[14px]" style={{ gridTemplateColumns: "60px 1fr" }}>
      <div className="absolute left-[29px] top-0 w-[1px] h-[14px]" style={{ backgroundImage: "linear-gradient(to bottom, var(--rule-3) 50%, transparent 50%)", backgroundSize: "1px 4px" }} />
      <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-right" style={{ color: "var(--bone-4)" }}>
        <span className="block text-[12px] tracking-[0.06em] mt-0.5" style={{ color: "var(--bone-2)" }}>{ix}</span>
      </div>
      <div
        className="border p-[14px] flex flex-col"
        style={highlight ? {
          borderColor: "rgba(198,255,58,0.45)",
          background: "rgba(198,255,58,0.04)",
          boxShadow: "0 0 0 1px rgba(198,255,58,0.10), 0 18px 40px -28px rgba(198,255,58,0.45)",
        } : {
          borderColor: "var(--rule)",
          background: "var(--ink)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Callout({ label, title, children }: { label: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border p-[22px]" style={{ borderColor: "var(--rule)" }}>
      <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase mb-[14px]" style={{ color: "var(--bone-4)" }}>{label}</span>
      <h4 className="font-serif font-normal text-[22px] leading-tight tracking-[-0.01em] mb-2" style={{ color: "var(--bone)" }}>{title}</h4>
      {children}
    </div>
  )
}
