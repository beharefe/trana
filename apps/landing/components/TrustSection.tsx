"use client"

import { useState } from "react"

// § 05 — Evidence of Deployment: TLS-cert style block

type CertKey = "guard" | "authority"

const CERT_DATA: Record<CertKey, { pid: string; hash: string; fp: string }> = {
  guard: {
    pid:  "TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG",
    hash: "SHA-256 · 9F:18:3A:CC:…",
    fp:   "TRAq9hnfQwzZqLmW8sKRyP1eNvBbChewX8boPDuBbVX",
  },
  authority: {
    pid:  "TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN",
    hash: "SHA-256 · 12:7A:E8:4F:…",
    fp:   "TRNA9zKpFw2HxQwvpKpUhNpVnDmLmSv7TgRanaGuArD",
  },
}

export function TrustSection() {
  const [cert, setCert] = useState<CertKey>("guard")
  const d = CERT_DATA[cert]

  return (
    <section id="trust" className="relative border-b py-16 md:py-24" style={{ borderColor: "var(--rule)" }}>
      <div className="sec-wrap">

        <div className="sec-header">
          <div className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span style={{ color: "var(--bone-2)" }}>§ 05</span> EVIDENCE OF DEPLOYMENT
          </div>
          <div>
            <h2 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance" style={{ fontSize: "clamp(34px,4.4vw,56px)", color: "var(--bone)" }}>
              This is real <em>infrastructure.</em><br />Verifiable from the chain up.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.55] font-light max-w-[640px]" style={{ color: "var(--bone-2)" }}>
              Program ID. Audit reports. License. The same fields you&apos;d expect
              on a TLS chain — pinned to slots, not screenshots.
            </p>
          </div>
        </div>

        {/* Cert block */}
        <div className="relative border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
          {/* Corner ticks — bone */}
          <div className="absolute top-[-1px] left-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderTop: "1px solid var(--bone)", borderLeft: "1px solid var(--bone)" }} />
          <div className="absolute bottom-[-1px] right-[-1px] w-[14px] h-[14px] pointer-events-none" style={{ borderBottom: "1px solid var(--bone)", borderRight: "1px solid var(--bone)" }} />

          {/* Header — scrollable tab strip + pinned VALID badge */}
          <div className="flex items-stretch border-b" style={{ borderColor: "var(--rule)", background: "rgba(235,232,224,0.02)", minHeight: "44px" }}>
            {/* Tab buttons — scroll if needed on narrow screens */}
            <div className="flex overflow-x-auto">
              {(["guard", "authority"] as CertKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setCert(k)}
                  className="h-full shrink-0 font-mono text-[11px] tracking-[0.18em] uppercase transition-all cursor-pointer"
                  style={{
                    padding: "0 16px",
                    borderTop: "none", borderLeft: "none", borderBottom: "none",
                    borderRight: "1px solid var(--rule)",
                    color: cert === k ? "var(--bone)" : "var(--bone-4)",
                    background: cert === k ? "rgba(198,255,58,0.04)" : "transparent",
                    boxShadow: cert === k ? "inset 0 -2px 0 0 var(--lime)" : "none",
                  }}
                >
                  <span className="hidden sm:inline">CERT · trana_</span>
                  <span className="sm:hidden">trana_</span>
                  {k}.so
                </button>
              ))}
            </div>
            {/* Always-visible status — hash hidden on mobile */}
            <div className="ml-auto flex items-center gap-[10px] px-[14px] sm:px-[22px] shrink-0">
              <span className="hidden sm:inline font-mono text-[10.5px] tracking-[0.16em] uppercase" style={{ color: "var(--bone-4)" }}>{d.hash}</span>
              <span
                className="inline-flex items-center gap-[7px] h-[26px] px-[11px] rounded-full font-mono text-[10.5px] tracking-[0.16em] uppercase"
                style={{ border: "1px solid rgba(198,255,58,0.40)", background: "rgba(198,255,58,0.06)", color: "var(--lime)" }}
              >
                <span className="w-[6px] h-[6px] rounded-full bg-[var(--lime)]" />
                VALID
              </span>
            </div>
          </div>

          {/* Body — responsive border logic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 border-b" style={{ borderColor: "var(--rule)" }}>
            {[
              {
                k: "Program ID",
                v: <span style={{ color: "var(--lime)", wordBreak: "break-all" }}>{d.pid}</span>,
                desc: "Verifiable on-chain · deployed on Solana devnet",
              },
              {
                k: "License",
                v: "MIT · open source · github.com/trana-so",
                desc: "Full reference implementation including SDK & macro",
              },
              {
                k: "Devnet",
                v: <span style={{ color: "var(--lime)" }}>LIVE since slot 314_204_911</span>,
                desc: "Continuous since 2026-04-12 · 0 incidents",
              },
              {
                k: "Audit",
                v: <span style={{ color: "var(--bone-2)" }}>Coming · Q3 2026</span>,
                desc: "Independent firm engaged · report published before mainnet freeze",
              },
            ].map((row, i) => {
              // Mobile (1-col): items 0-2 get bottom border.
              // Desktop (2-col): left column gets right border; top row gets bottom border.
              const borderCls = [
                "border-b sm:border-r",
                "border-b",
                "border-b sm:border-b-0 sm:border-r",
                "",
              ][i]
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-1.5 p-[22px] ${borderCls}`}
                  style={{ borderColor: "var(--rule)" }}
                >
                  <span className="font-mono text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>{row.k}</span>
                  <span className="font-mono text-[14px] tracking-[0.02em]" style={{ color: "var(--bone)" }}>{row.v}</span>
                  <span className="text-[12px] leading-[1.5] font-light" style={{ color: "var(--bone-3)" }}>{row.desc}</span>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 flex-wrap px-[14px] sm:px-[22px] py-[14px] font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-3)" }}>
            <span className="inline-flex items-center gap-2" style={{ color: "var(--bone-2)" }}>
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: "var(--lime)" }} />
              FINGERPRINT VALID
            </span>
            <span style={{ color: "var(--bone-5)" }}>·</span>
            <span className="break-all">{d.fp}</span>
          </div>
        </div>

      </div>
    </section>
  )
}
