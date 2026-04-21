import { Hero } from "@/components/Hero"
import { DemoPanel } from "@/components/DemoPanel"
import { CodeBlock } from "@/components/CodeBlock"

// ── Structured data ───────────────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trana",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Solana",
  description:
    "Trana enforces second-factor authorization at execution time. High-risk actions do not execute without explicit approval.",
  url: "https://trana.dev",
  creator: { "@type": "Organization", name: "Trana" },
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

        {/* ── Nav ────────────────────────────────────────────────────────────── */}
        <nav
          aria-label="Main navigation"
          className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md"
        >
          <div className="max-w-5xl mx-auto px-8 h-20 flex items-center justify-between">
            <span className="font-serif text-lg text-ink">Trana</span>
            <div className="flex items-center gap-6 text-sm text-muted">
              <a href="#how-it-works" className="hover:text-ink transition-colors hidden sm:block">How it works</a>
              <a href="#developer" className="hover:text-ink transition-colors hidden sm:block">Developers</a>
              <a
                href="https://github.com/beharefe/trana-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2 rounded-full border border-border text-ink text-xs font-medium hover:bg-card transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>

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
                "Without a valid approval, execution fails. The transaction is rejected atomically.",
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
              <p className="text-muted text-base leading-relaxed">
                No custody change. No vault. No new infrastructure. Your program
                keeps full control. Trana enforces that a valid proof existed at
                the moment the transaction executed.
              </p>
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
              <p className="text-muted text-base leading-relaxed">
                The second-factor key is registered onchain. Approvals are
                verified onchain. There is no trusted backend and no offchain
                enforcement component that can be compromised or bypassed.
              </p>
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
            <a
              href="https://github.com/beharefe/trana-guard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/90 transition-colors"
            >
              View on GitHub
            </a>
            <a
              href="#demo"
              className="px-7 py-3 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
            >
              Try the demo
            </a>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-border py-10">
          <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <span className="font-serif text-ink">Trana</span>
              <span className="text-faint text-xs">© 2026</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted">
              <a
                href="https://github.com/beharefe/trana-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink transition-colors"
              >
                GitHub
              </a>
              <span className="text-faint text-xs">
                Pitch Contest Kraków · April 2026
              </span>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
