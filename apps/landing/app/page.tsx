import Link from "next/link"
import { Hero } from "@/components/Hero"
import { DemoPanel } from "@/components/DemoPanel"
import { CodeBlock } from "@/components/CodeBlock"
import { SiteNav } from "@/components/SiteNav"

// ── Structured data ───────────────────────────────────────────────────────────

const jsonLd = {
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
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function Rule() {
  return <hr className="border-0 border-t border-border max-w-5xl mx-auto" />
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-widest uppercase text-faint mb-6">
      {children}
    </p>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="bg-bg text-ink">

        <SiteNav variant="home" />

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <Hero />

        {/* ── Problem ──────────────────────────────────────────────────────── */}
        <Rule />
        <section id="problem" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Problem</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
                Signing is treated as authorization.
                <br />
                <span className="italic">That assumption is broken.</span>
              </h2>
              <p className="text-muted text-lg leading-relaxed mb-4">
                Transactions can be pre-signed, socially engineered, or executed
                later using durable nonces. Once signed, execution is automatic.
              </p>
              <p className="text-muted text-base leading-relaxed">
                Multisig does not fix this. It only increases the number of
                signatures required.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Pre-signed transactions",
                  body: "Valid signatures are gathered in advance, days or weeks before they are used. The chain has no way to object when they finally land.",
                },
                {
                  title: "Social engineering",
                  body: "Signers are convinced to authorize transactions they do not fully understand. The signature is genuine. The intent is not.",
                },
                {
                  title: "Durable nonce replay",
                  body: "Attackers pre-sign with a valid durable nonce, wait for the right moment, then execute without further interaction from the signer.",
                },
                {
                  title: "No checkpoint at execution",
                  body: "Once a valid signature exists, nothing on the execution path can object. The transaction runs.",
                },
              ].map(({ title, body }) => (
                <div key={title} className="p-5 rounded-2xl border border-border bg-card">
                  <p className="font-medium text-ink text-sm mb-1.5">{title}</p>
                  <p className="text-muted text-sm leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Solution ─────────────────────────────────────────────────────── */}
        <Rule />
        <section id="solution" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Solution</Label>
          <div className="max-w-2xl mb-12">
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
              Second-factor authorization
              <br />
              <span className="italic text-accent">at execution.</span>
            </h2>
            <p className="text-muted text-lg leading-relaxed mb-8">
              Trana blocks execution unless a second approval is present. Even if
              an attacker obtains valid signatures, the transaction still fails.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Signature alone is not sufficient",
                body: "A valid wallet signature no longer guarantees execution. A second cryptographic approval is required.",
              },
              {
                n: "02",
                title: "Approval is required at execution",
                body: "The proof must be generated for this exact transaction at the moment it runs. Pre-collected approvals do not work.",
              },
              {
                n: "03",
                title: "Enforced directly onchain",
                body: "There is no client-side component to bypass. The guard runs inside the Anchor program. No proof means no execution.",
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="p-6 rounded-2xl border border-border bg-card">
                <p className="text-xs font-medium text-faint mb-4 font-mono">{n}</p>
                <p className="font-medium text-ink text-sm mb-2">{title}</p>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <Rule />
        <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-32">
          <Label>How it works</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                Every step verified
                <br />
                <span className="italic">onchain.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed">
                Approval is provided using a passkey or second-factor key and
                verified onchain. The secp256r1 precompile checks the
                cryptographic proof at the moment the transaction executes.
              </p>
            </div>
            <ol className="space-y-0" aria-label="How Trana works">
              {[
                "User signs transaction with their wallet.",
                "Trana checks if the instruction requires authorization based on the configured policy.",
                "If required, a second-factor approval must be present, bound to this exact transaction.",
                "Without a valid approval, execution fails. The entire transaction is rejected — nothing partial goes through.",
              ].map((label, i) => (
                <li key={i} className="flex gap-5 text-left list-none">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-7 h-7 rounded-full border border-border bg-bg flex items-center justify-center shrink-0">
                      <span className="text-faint text-xs font-mono">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    {i < 3 && <div className="w-px flex-1 min-h-6 bg-border my-1" />}
                  </div>
                  <p className={`pt-1 text-sm leading-relaxed pb-5 ${i === 3 ? "text-ink font-medium" : "text-muted"}`}>
                    {label}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Demo ─────────────────────────────────────────────────────────── */}
        <Rule />
        <section id="demo" className="max-w-5xl mx-auto px-6 py-32">
          <div className="mb-10">
            <Label>Interactive demo</Label>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
              The key is compromised.
            </h2>
            <p className="text-muted text-lg max-w-md">
              Watch the guard reject a raw withdrawal. Then approve it with a passkey.
            </p>
          </div>
          <DemoPanel />
        </section>

        {/* ── What Trana protects ───────────────────────────────────────────── */}
        <Rule />
        <section id="protects" className="max-w-5xl mx-auto px-6 py-32">
          <Label>What Trana protects</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
            Any instruction where execution
            <br />
            <span className="italic">must be explicitly approved.</span>
          </h2>
          <p className="text-muted text-lg mb-12">
            If a single leaked key would be catastrophic, Trana belongs in that path.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Protocol upgrades",
                body: "Upgrade authority and migration instructions require explicit passkey approval at execution time. A stolen admin key alone cannot trigger them.",
              },
              {
                title: "DAO treasury transfers",
                body: "Large disbursements and budget allocations are blocked without a second-factor approval bound to the exact amount and recipient.",
              },
              {
                title: "Vault withdrawals",
                body: "Collateral unlocks and high-value transfers require explicit approval at the moment the instruction executes.",
              },
              {
                title: "Any instruction you can't undo",
                body: "Any irreversible onchain action where a single compromised signer would cause unrecoverable damage.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="p-6 rounded-2xl border border-border bg-card">
                <p className="font-medium text-ink text-sm mb-2">{title}</p>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Developer ────────────────────────────────────────────────────── */}
        <Rule />
        <section id="developer" className="max-w-5xl mx-auto px-6 py-32">
          <Label>For developers</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                One call.
                <br />
                <span className="italic">Any Anchor program.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed mb-4">
                Add one guard to your instruction. Execution will fail unless a
                valid second-factor approval is included in the transaction.
              </p>
              <p className="text-muted text-base leading-relaxed mb-6">
                No custody change. No vault. No new infrastructure. Your program
                keeps full control. Trana's only job: confirm a valid proof
                existed when the transaction ran.
              </p>
              <Link
                href="/docs/quickstart"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-accent transition-colors"
              >
                Read the 5-minute quickstart →
              </Link>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-faint font-mono mb-2">Cargo.toml</p>
                <CodeBlock language="toml">
{`guard = { git = "github.com/beharefe/trana-guard",
          features = ["cpi"] }`}
                </CodeBlock>
              </div>
              <div>
                <p className="text-xs text-faint font-mono mb-2">In your Anchor instruction</p>
                <CodeBlock language="rust">
{`pub fn your_protected_ix(ctx: Context<...>, expiry: i64) -> Result<()> {
    guard::cpi::enforce(
        CpiContext::new(ctx.accounts.trana_program, Enforce {
            registry:     ctx.accounts.trana_registry,
            instructions: ctx.accounts.instructions,
        }),
        Policy::AdminAction,
        payload_hash,
        expiry,
    )?;

    // Only reached if second-factor approval was valid.
    Ok(())
}`}
                </CodeBlock>
              </div>
            </div>
          </div>
        </section>

        {/* ── Security model ───────────────────────────────────────────────── */}
        <Rule />
        <section id="security" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Security model</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                Only valid cryptographic proof
                <br />
                <span className="italic">allows execution.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed mb-6">
                The second-factor key is registered onchain. Approvals are
                verified onchain. There is no trusted backend and no offchain
                enforcement component that can be compromised or bypassed.
              </p>
              <Link
                href="/security"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-accent transition-colors"
              >
                Full attack matrix and trust model →
              </Link>
            </div>
            <div className="space-y-3">
              {[
                {
                  title: "Second-factor key registered onchain",
                  body: "The P-256 public key is stored in a PDA. Registration requires a wallet signature. The key cannot be changed without authorization.",
                },
                {
                  title: "Approval verified onchain",
                  body: "The secp256r1 precompile verifies the proof at execution time. The verification runs inside the program, not in a backend.",
                },
                {
                  title: "No trusted backend",
                  body: "Trana does not rely on any offchain service to make enforcement decisions. The full trust chain is onchain.",
                },
                {
                  title: "No offchain enforcement",
                  body: "There is no middleware, no API gateway, and no SDK check that can be bypassed. The guard runs inside the Anchor instruction.",
                },
              ].map(({ title, body }) => (
                <div key={title} className="p-5 rounded-2xl border border-border bg-card">
                  <p className="font-medium text-ink text-sm mb-1.5">{title}</p>
                  <p className="text-muted text-sm leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Deep Dive ────────────────────────────────────────────────────── */}
        <Rule />
        <section id="deep-dive" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Go deeper</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
            Everything you need
            <br />
            <span className="italic">to build with Trana.</span>
          </h2>
          <p className="text-muted text-lg mb-12 max-w-lg">
            Integration guide, security model, and comparison pages — all written for protocol developers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                href: "/protocol",
                label: "Protocol",
                title: "The full stack",
                body: "Two signers, one execution gate. FIDO2 + Trana Guard paired, wallet signing in context, Solana as the ledger.",
                tag: "Protocol",
              },
              {
                href: "/docs/quickstart",
                label: "Quickstart",
                title: "5-minute integration",
                body: "Three accounts. One CPI call. Works with any Anchor program and any FIDO2 device.",
                tag: "Docs",
              },
              {
                href: "/security",
                label: "Security Model",
                title: "Attack matrix",
                body: "Eight attack scenarios, proof pipeline, and trust model. What Trana guarantees — and what it does not.",
                tag: "Security",
              },
              {
                href: "/compare/multisig",
                label: "Trana vs Multisig",
                title: "Governance vs execution",
                body: "Multisig is M-of-N coordination. Trana is execution-time enforcement. They compose.",
                tag: "Compare",
              },
              {
                href: "/compare/para",
                label: "Para vs Trana",
                title: "Authentication vs authorization",
                body: "Para answers 'who is this user.' Trana answers 'should this instruction run.' Both questions matter.",
                tag: "Compare",
              },
              {
                href: "/docs/glossary",
                label: "Glossary",
                title: "Every term defined",
                body: "secp256r1, SIMD-0075, FIDO2, intent hash, enforcement nonce, and 15 more.",
                tag: "Docs",
              },
            ].map(({ href, label, title, body, tag }) => (
              <Link
                key={href}
                href={href}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-ink/30 hover:bg-card/80 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-medium tracking-widest uppercase text-faint">{tag}</span>
                  <span className="text-faint group-hover:text-ink transition-colors text-sm">↗</span>
                </div>
                <p className="font-medium text-ink text-sm mb-1.5">{title}</p>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
                <p className="mt-4 text-xs font-medium text-ink/60 group-hover:text-accent transition-colors">{label} →</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Protocol stack ───────────────────────────────────────────────── */}
        <Rule />
        <section id="protocol" className="max-w-5xl mx-auto px-6 py-32 scroll-mt-20">
          <Label>Protocol</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                Where Trana
                <br />
                <span className="italic">sits in the stack.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed">
                Trana is a guard layer that lives inside your Solana program. It has no custody, no admin key, and no offchain component. The secp256r1 precompile is the root of trust.
              </p>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              {/* Connector line top */}
              <div className="flex justify-center py-1.5 border-b border-border/50">
                <div className="w-px h-5 bg-border" />
              </div>

              {/* Row: FIDO2 Device */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-bg">
                <div className="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="text-ink shrink-0">
                    <rect x="1" y="4" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                    <circle cx="5" cy="9" r="1.5" fill="currentColor"/>
                    <path d="M8.5 7h5M8.5 9h4M8.5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm font-medium text-ink tracking-tight">PASSKEY / YUBIKEY</span>
                </div>
                <span className="text-xs font-medium text-faint tracking-widest uppercase">FIDO2 Device</span>
              </div>

              {/* Connector */}
              <div className="flex justify-center py-1.5 border-b border-border/50">
                <div className="w-px h-5 bg-border" />
              </div>

              {/* Row: Trana Guard — highlighted */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-accent/5 border-l-2 border-l-accent">
                <div className="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="text-accent shrink-0">
                    <path d="M9 1.5L2.5 4.5V9c0 3.5 2.8 6.5 6.5 7.5 3.7-1 6.5-4 6.5-7.5V4.5L9 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-medium text-ink tracking-tight">TRANA GUARD</span>
                </div>
                <span className="text-xs font-medium text-accent tracking-widest uppercase">Authorization Layer</span>
              </div>

              {/* Connector */}
              <div className="flex justify-center py-1.5 border-b border-border/50">
                <div className="w-px h-5 bg-border" />
              </div>

              {/* Row: Anchor Program */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-bg">
                <div className="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="text-ink shrink-0">
                    <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5.5 6.5h7M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm font-medium text-ink tracking-tight">ANCHOR PROGRAM</span>
                </div>
                <span className="text-xs font-medium text-faint tracking-widest uppercase">Your Code</span>
              </div>

              {/* Connector */}
              <div className="flex justify-center py-1.5 border-b border-border/50">
                <div className="w-px h-5 bg-border" />
              </div>

              {/* Row: Solana */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="text-ink shrink-0">
                    <path d="M3 5.5h10.5l1.5-2H4.5L3 5.5Z" fill="currentColor"/>
                    <path d="M3 9.5h10.5l1.5-2H4.5L3 9.5Z" fill="currentColor" opacity=".6"/>
                    <path d="M3 13.5h10.5l1.5-2H4.5L3 13.5Z" fill="currentColor" opacity=".35"/>
                  </svg>
                  <span className="text-sm font-medium text-ink tracking-tight">SOLANA</span>
                </div>
                <span className="text-xs font-medium text-faint tracking-widest uppercase">Ledger + secp256r1</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Principle / Closing ───────────────────────────────────────────── */}
        <Rule />
        <section className="max-w-5xl mx-auto px-6 py-44 text-center">
          <blockquote className="max-w-2xl mx-auto">
            <p className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight text-ink">
              &ldquo;Signatures can be collected early.
              <br />
              <span className="italic text-accent">Execution must be approved late.&rdquo;</span>
            </p>
          </blockquote>
          <div className="flex flex-wrap justify-center gap-4 mt-12">
            <Link
              href="/docs/quickstart"
              className="px-7 py-3 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/90 transition-colors"
            >
              Start building
            </Link>
            <a
              href="https://github.com/beharefe/trana-guard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-border pt-16 pb-10">
          <div className="max-w-5xl mx-auto px-6">
            {/* Top grid */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-10 sm:gap-8 mb-14">

              {/* Brand — takes 2 cols */}
              <div className="sm:col-span-2">
                <span className="font-serif text-ink text-2xl">Trana</span>
                <p className="text-muted text-sm mt-3 leading-relaxed max-w-xs">
                  Execution-time second-factor authorization for Solana. A stolen key alone cannot execute protected actions.
                </p>
              </div>

              {/* Resources */}
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-4">Docs</p>
                <div className="flex flex-col gap-3 text-sm text-muted">
                  <Link href="/protocol"         className="hover:text-ink transition-colors">Protocol</Link>
                  <Link href="/docs/quickstart" className="hover:text-ink transition-colors">Quickstart</Link>
                  <Link href="/docs/glossary"   className="hover:text-ink transition-colors">Glossary</Link>
                  <Link href="/security"        className="hover:text-ink transition-colors">Security Model</Link>
                  <a href="https://github.com/beharefe/trana-guard" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">GitHub</a>
                </div>
              </div>

              {/* Compare */}
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-4">Compare</p>
                <div className="flex flex-col gap-3 text-sm text-muted">
                  <Link href="/compare/multisig" className="hover:text-ink transition-colors">vs Multisig</Link>
                  <Link href="/compare/para"     className="hover:text-ink transition-colors">vs Para</Link>
                </div>
              </div>

              {/* Community */}
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-4">Community</p>
                <div className="flex flex-col gap-3 text-sm text-muted">
                  <a
                    href="https://x.com/beharefe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink transition-colors flex items-center gap-1.5"
                  >
                    {/* X icon */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    @beharefe
                  </a>
                  <a
                    href="https://t.me/beharefe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink transition-colors flex items-center gap-1.5"
                  >
                    {/* Telegram icon */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                    @beharefe
                  </a>
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-faint text-xs">© 2026 Trana, Inc. All rights reserved.</p>
                <p className="text-faint text-xs mt-0.5">1111B S Governors Ave STE 39117, Dover, DE 19904</p>
              </div>
              <p className="text-faint text-xs text-left sm:text-right max-w-xs">
                Trana, Inc. is a software company, not a financial institution or custodian.
              </p>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
