import Link from "next/link"
import { SiteNav }              from "@/components/SiteNav"
import { Hero }                 from "@/components/Hero"
import { TwoPrimitivesSection } from "@/components/TwoPrimitivesSection"
import { HowItWorksSection }    from "@/components/HowItWorksSection"
import { PoliciesSection }      from "@/components/PoliciesSection"
import { CodeSection }          from "@/components/CodeSection"
import { TrustSection }         from "@/components/TrustSection"
import { JsonLd }               from "@/components/JsonLd"

export default function Home() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Trana",
        applicationCategory: "SecurityApplication",
        operatingSystem: "Solana",
        description: "Trana enforces second-factor authorization at execution time. High-risk actions do not execute without explicit approval.",
        url: "https://trana.so",
        creator: {
          "@type": "Organization",
          name: "Trana, Inc.",
          address: {
            "@type": "PostalAddress",
            streetAddress: "1111B S Governors Ave STE 39117",
            addressLocality: "Dover",
            addressRegion: "DE",
            postalCode: "19904",
            addressCountry: "US",
          },
        },
      }} />

      <SiteNav />

      <main style={{ background: "var(--bg)", color: "var(--bone)", overflowX: "hidden" }}>
        <Hero />
        <TwoPrimitivesSection />
        <HowItWorksSection />
        <PoliciesSection />
        <CodeSection />
        <TrustSection />
        <Footer />
      </main>
    </>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer id="waitlist" className="pt-24 pb-9" style={{ background: "var(--bg)" }}>
      <div className="sec-wrap">

        {/* Waitlist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-end mb-16">
          <div>
            <h2
              className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance"
              style={{ fontSize: "clamp(36px,4.6vw,56px)", color: "var(--bone)" }}
            >
              Mainnet, <em>Q3 2026.</em><br />Get the design notes.
            </h2>
            <p className="mt-4 text-[15.5px] leading-[1.55] font-light max-w-[480px]" style={{ color: "var(--bone-3)" }}>
              Ship-ready notice when the program freezes for audit.
              Plus: deep-dive posts on the secp256r1 ceremony and policy composition.
              One email per release. No marketing.
            </p>
          </div>
          <WaitlistForm />
        </div>

        {/* Links */}
        <div
          className="footer-grid pt-9 border-t"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[10px]">
              <span className="relative inline-block w-[22px] h-[22px] shrink-0" style={{ border: "1.5px solid var(--bone)" }}>
                <span className="absolute" style={{ inset: "4px", border: "1.5px solid var(--lime)" }} />
              </span>
              <span className="font-serif text-[22px] leading-none tracking-[-0.01em]" style={{ color: "var(--bone)" }}>trana</span>
            </div>
            <p className="text-[13px] leading-[1.55] font-light m-0" style={{ color: "var(--bone-3)" }}>
              Execution-time authorization for Solana programs.
              A security primitive — not a wallet, not a SaaS.
            </p>
          </div>

          <FooterCol title="Protocol">
            <FooterLink href="#how">How it works</FooterLink>
            <FooterLink href="#policies">Policies</FooterLink>
            <FooterLink href="#code">Integrate</FooterLink>
            <FooterLink href="#trust">Audits</FooterLink>
          </FooterCol>

          <FooterCol title="Developers">
            <FooterLink href="/docs/quickstart">Docs</FooterLink>
            <FooterLink href="/docs/quickstart">SDK reference</FooterLink>
            <FooterLink href="/docs/quickstart">Anchor macro</FooterLink>
            <FooterLink href="https://github.com/beharefe/trana-guard" external>GitHub</FooterLink>
          </FooterCol>

          <FooterCol title="Project">
            <FooterLink href="/protocol">Protocol</FooterLink>
            <FooterLink href="/security">Threat model</FooterLink>
            <FooterLink href="/compare/multisig">vs Multisig</FooterLink>
            <FooterLink href="https://x.com/beharefe" external>X / Twitter</FooterLink>
          </FooterCol>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-16 pt-6 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-mono text-[10.5px] tracking-[0.18em] uppercase"
          style={{ borderColor: "var(--rule)", color: "var(--bone-4)" }}
        >
          <span>© 2026 TRANA, INC. · MIT-LICENSED</span>
          <span className="flex items-center gap-3">
            <span className="relative inline-block w-[7px] h-[7px] rounded-full" style={{ background: "var(--lime)" }} />
            DEVNET · LIVE
          </span>
          <span className="hidden md:inline">1111B S GOVERNORS AVE STE 39117, DOVER DE 19904</span>
        </div>

      </div>
    </footer>
  )
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="font-mono text-[10px] tracking-[0.22em] uppercase font-medium mb-[14px]" style={{ color: "var(--bone-4)" }}>{title}</h5>
      <div className="flex flex-col gap-0">{children}</div>
    </div>
  )
}

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const cls = "block py-1 font-mono text-[12px] tracking-[0.04em] transition-colors"
  const style = { color: "var(--bone-2)" }
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{children}</a>
  }
  return <Link href={href} className={cls} style={style}>{children}</Link>
}

function WaitlistForm() {
  return (
    <form method="POST" action="/api/waitlist">
      <div
        className="flex flex-col gap-[14px] p-[18px]"
        style={{ border: "1px solid var(--rule-2)", background: "var(--ink-2)" }}
      >
        <div
          className="flex flex-wrap items-center gap-2 min-h-[52px] px-[14px] py-2"
          style={{ border: "1px solid var(--rule)", background: "var(--ink)" }}
        >
          <span className="font-mono text-[13px] tracking-[0.04em] shrink-0" style={{ color: "var(--lime)" }}>
            $ trana subscribe ——
          </span>
          <input
            type="email"
            name="email"
            placeholder="your@email.com"
            required
            className="flex-1 min-w-[140px] bg-transparent border-0 outline-none font-mono text-[13px] tracking-[0.02em]"
            style={{ color: "var(--bone)", caretColor: "var(--lime)" }}
          />
          <button
            type="submit"
            className="shrink-0 h-9 px-[14px] font-mono text-[11px] tracking-[0.16em] uppercase cursor-pointer border-0 transition-colors"
            style={{ background: "var(--lime)", color: "var(--ink)" }}
          >
            Join waitlist →
          </button>
        </div>
        <p className="font-mono text-[11px] tracking-[0.04em] m-0" style={{ color: "var(--bone-4)" }}>
          // awaiting input · engineers subscribed
        </p>
      </div>
    </form>
  )
}
