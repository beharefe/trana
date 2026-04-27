import Link from "next/link"
import { SiteNav }          from "@/components/SiteNav"
import { Hero }             from "@/components/Hero"
import { RequireSection }       from "@/components/RequireSection"
import { LimitSection }        from "@/components/LimitSection"
import { NotBeforeSection }    from "@/components/NotBeforeSection"
import { PolicyGrid }       from "@/components/PolicyGrid"
import { JsonLd }           from "@/components/JsonLd"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Trana",
        applicationCategory: "SecurityApplication",
        operatingSystem: "Solana",
        description:
          "Trana enforces second-factor authorization at execution time. High-risk actions do not execute without explicit approval.",
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

      <main className="bg-bg text-ink overflow-x-hidden">
        <SiteNav />
        <Hero />
        <RequireSection />
        <LimitSection />
        <NotBeforeSection />
        <PolicyGrid />
        <Footer />
      </main>
    </>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer id="waitlist" className="relative pt-24 pb-20 border-t border-white/[0.08] bg-bg">
      <div className="max-w-[1320px] mx-auto px-6 sm:px-12">

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-12">

          {/* CTA */}
          <div className="sm:col-span-2 lg:col-span-1">
            <h3 className="font-serif text-[34px] leading-[1.05] tracking-[-0.025em] text-ink mb-2 text-balance">
              Mainnet waitlist.
            </h3>
            <p className="text-muted text-[14.5px] max-w-[36ch] mb-6 leading-relaxed">
              Trana is live on devnet. Drop your email to be the first to
              know when we ship to mainnet-beta.
            </p>
            <WaitlistForm />
          </div>

          {/* Product */}
          <FooterCol title="Product">
            <FooterLink href="/docs/quickstart">Docs</FooterLink>
            <FooterLink href="/docs/quickstart">Quickstart</FooterLink>
            <FooterLink href="/docs/quickstart">Policy reference</FooterLink>
            <FooterLink href="/protocol">Protocol</FooterLink>
          </FooterCol>

          {/* Community */}
          <FooterCol title="Community">
            <FooterLink href="https://github.com/beharefe/trana-guard" external>GitHub</FooterLink>
            <FooterLink href="https://x.com/beharefe" external>X / Twitter</FooterLink>
            <FooterLink href="https://t.me/beharefe" external>Telegram</FooterLink>
          </FooterCol>

          {/* Resources */}
          <FooterCol title="Resources">
            <FooterLink href="/security">Security model</FooterLink>
            <FooterLink href="/compare/multisig">vs Multisig</FooterLink>
            <FooterLink href="/compare/para">vs Para</FooterLink>
            <FooterLink href="/docs/glossary">Glossary</FooterLink>
          </FooterCol>

        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-[11.5px] text-faint tracking-[0.04em]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>backed by</span>
            <LogoPill label="Superteam Poland" gradient="linear-gradient(135deg,#7aa8ff,#b794ff)" />
            <span>· built for</span>
            <LogoPill label="Solana"    gradient="linear-gradient(135deg,#9945ff,#14f195)" />
            <LogoPill label="Colosseum" gradient="linear-gradient(135deg,#f3d77a,#ff7a59)" />
          </div>
          <div className="sm:text-right">
            <p>© 2026 Trana, Inc. · MIT licensed</p>
            <p className="mt-0.5 text-[10.5px]">1111B S Governors Ave STE 39117, Dover, DE 19904</p>
          </div>
        </div>

      </div>
    </footer>
  )
}

// ── Footer sub-components ─────────────────────────────────────────────────────

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-mono text-[11px] text-faint tracking-[0.08em] uppercase mb-3.5 font-medium">
        {title}
      </h4>
      <ul className="flex flex-col gap-2.5">
        {children}
      </ul>
    </div>
  )
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string
  external?: boolean
  children: React.ReactNode
}) {
  const cls = "text-muted text-[14px] hover:text-ink transition-colors"
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      </li>
    )
  }
  return (
    <li>
      <Link href={href} className={cls}>{children}</Link>
    </li>
  )
}

function LogoPill({ label, gradient }: { label: string; gradient: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-white/[0.08] rounded-full text-[12px] text-muted">
      <span className="w-3.5 h-3.5 rounded-[3px] shrink-0" style={{ background: gradient }} />
      {label}
    </span>
  )
}

function WaitlistForm() {
  return (
    <form
      method="POST"
      action="/api/waitlist"
      className="flex items-stretch border border-white/[0.14] rounded-full overflow-hidden bg-white/[0.02] max-w-[420px]"
    >
      <input
        type="email"
        name="email"
        placeholder="you@protocol.xyz"
        required
        className="flex-1 bg-transparent border-0 outline-none text-ink font-[inherit] text-[14px] px-[18px] placeholder:text-faint"
      />
      <button
        type="submit"
        className="border-0 bg-ink text-bg font-semibold text-[13.5px] px-[18px] cursor-pointer tracking-[-0.005em] hover:bg-white transition-colors whitespace-nowrap"
      >
        Join waitlist →
      </button>
    </form>
  )
}
