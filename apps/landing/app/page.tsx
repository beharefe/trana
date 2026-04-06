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
    "Trana is an onchain authorization primitive for Solana that enforces second-factor passkey approval at transaction execution time.",
  url: "https://trana.dev",
  creator: { "@type": "Organization", name: "Trana" },
  featureList: [
    "Execution-time authorization enforcement",
    "WebAuthn passkey integration",
    "secp256r1 P-256 onchain verification",
    "Ed25519 bridge proof verification",
    "Replay attack prevention via monotonic nonces",
    "Anchor 0.32 compatible",
  ],
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Trana?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Trana is an onchain authorization primitive for Solana. It enforces a second-factor passkey approval at the moment a transaction executes, not when it was signed.",
      },
    },
    {
      "@type": "Question",
      name: "How is Trana different from multisig?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Multisig requires more signers but doesn't change when authorization happens. Trana enforces approval at the exact moment of execution, closing the window between signing and execution that attackers exploit.",
      },
    },
    {
      "@type": "Question",
      name: "Can the Trana guard be bypassed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The guard runs inside the Anchor program onchain. A raw transaction without a valid proof fails the same way a UI transaction would.",
      },
    },
    {
      "@type": "Question",
      name: "Who should use Trana?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Protocol administrators managing upgrade authority, DAO treasuries handling large disbursements, vault operators, and any team where a single compromised key would cause irreversible damage.",
      },
    },
  ],
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

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
          <Label>The problem</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
                The exploit wasn&apos;t a weak key.
                <br />
                <span className="italic">It was an unconditional signature.</span>
              </h2>
              <p className="text-muted text-lg leading-relaxed mb-4">
                The Drift $285M drain (April 2026) proved it. The signatures
                were cryptographically valid. The chain had no mechanism to say
                no at the moment the transaction actually ran.
              </p>
              <p className="text-muted text-base leading-relaxed">
                This is not a key-strength problem. It is an authorization
                timing problem.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Signatures can be collected in advance",
                  body: "Valid signatures are gathered through social engineering or key extraction, sometimes weeks before they are used.",
                },
                {
                  title: "Durable nonces enable pre-signed attacks",
                  body: "Attackers pre-sign with a valid durable nonce, wait for the right moment, then execute without further interaction.",
                },
                {
                  title: "The chain executes unconditionally",
                  body: "Once a valid signature exists, execution is automatic. No mechanism on the execution path can object.",
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
          <Label>The solution</Label>
          <div className="max-w-2xl">
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
              Authorization that happens
              <br />
              <span className="italic text-accent">at execution.</span>
            </h2>
            <p className="text-muted text-lg leading-relaxed mb-10">
              Trana closes the gap between signing and execution. Every protected
              transaction must carry a passkey proof generated for that exact
              action, amount, vault, and nonce, moments before it lands onchain.
              No proof. No execution. Period.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Proof at execution",
                body: "The program verifies a cryptographic proof at the exact moment it runs, not at signing time.",
              },
              {
                n: "02",
                title: "Bound to exact parameters",
                body: "Amount, vault, nonce, and expiry are embedded in the proof. Tamper with any field and it fails.",
              },
              {
                n: "03",
                title: "Enforced onchain",
                body: "There is no UI bypass. A raw transaction without a valid proof is rejected identically.",
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
                Every step verified onchain.
                <br />
                <span className="italic">No exceptions.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed">
                The guard reads the Instructions sysvar at execution time.
                A secp256r1 or Ed25519 precompile instruction must be present
                at index 0, signed by the registered key, covering the exact
                payload hash of the current transaction.
              </p>
            </div>
            <ol className="space-y-0" aria-label="How Trana works">
              {[
                "Transaction constructed and signed by the user's wallet",
                "Trana evaluates the configured policy: high-value threshold, admin action, or opt-in",
                "If policy triggers, a passkey approval is required, bound to this exact transaction",
                "Onchain verification of the proof. No valid proof means the transaction fails atomically.",
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
          <p className="mt-10 text-base font-medium text-ink border-t border-border pt-8 max-w-lg">
            Signatures can be collected early.
            <span className="text-accent"> Execution must be approved late.</span>
          </p>
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

        {/* ── Comparison ───────────────────────────────────────────────────── */}
        <Rule />
        <section id="comparison" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Comparison</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
            Other approaches protect keys.
            <br />
            <span className="italic">Trana protects execution.</span>
          </h2>
          <p className="text-muted text-lg mb-10">
            The enforcement point is what matters.
          </p>

          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm" aria-label="Security comparison table">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="text-left px-5 py-3.5 text-muted font-medium">Approach</th>
                  <th className="text-left px-5 py-3.5 text-muted font-medium">When enforced</th>
                  <th className="text-left px-5 py-3.5 text-muted font-medium">Stops key theft?</th>
                </tr>
              </thead>
              <tbody className="bg-bg">
                {(
                  [
                    ["UI warning",       "Client only, never enforced",       false],
                    ["Hardware wallet",  "At signing time",                  false],
                    ["Multisig",         "At signing time",                  false],
                    ["Trana",            "At execution time, onchain",       true],
                  ] as [string, string, boolean][]
                ).map(([approach, when, stops], i) => (
                  <tr key={approach} className={`border-b border-border last:border-0 ${i === 3 ? "bg-accent/5" : ""}`}>
                    <td className={`px-5 py-4 font-medium ${i === 3 ? "text-accent" : "text-ink"}`}>{approach}</td>
                    <td className="px-5 py-4 text-muted">{when}</td>
                    <td className={`px-5 py-4 font-medium ${stops ? "text-green-700" : "text-red-500/70"}`}>
                      {stops ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Use cases ────────────────────────────────────────────────────── */}
        <Rule />
        <section id="use-cases" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Use cases</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
            Built for actions you can&apos;t afford
            <br />
            <span className="italic">to get wrong.</span>
          </h2>
          <p className="text-muted text-lg mb-10">
            If a single leaked key would be catastrophic, Trana belongs in that path.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Protocol administration",
                body: "Upgrade authority, migration instructions, and parameter changes. All require passkey approval at execution time.",
              },
              {
                title: "DAO treasury",
                body: "Large disbursements, budget allocations, emergency withdrawals require explicit passkey approval.",
              },
              {
                title: "Vault releases",
                body: "Collateral unlocks, yield distributions, and high-value transfers protected at execution time.",
              },
              {
                title: "Critical operations",
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
                Works with any
                <br />
                <span className="italic">Anchor program.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed mb-6">
                Two paths: the registry path registers a secp256r1 P-256 key
                onchain. No trusted server required. The bridge path uses an
                Ed25519 server key for WebAuthn flows.
              </p>
              <div className="space-y-2 text-sm">
                {[
                  "secp256r1 native passkey curve (Touch ID, Face ID, YubiKey)",
                  "Ed25519 bridge server key",
                  "Replay protection via monotonic nonces",
                  "Anchor 0.32 · Solana 3.1",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-muted">
                    <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-faint font-mono mb-2">1. Register passkey onchain</p>
                <CodeBlock language="typescript">
{`await program.methods
  .registerTwoFa(
    { secp256R1Passkey: {} },
    Buffer.from(p256PubKey),  // 33-byte compressed
    Buffer.from(credentialId)
  )
  .accounts({ registry, owner, systemProgram })
  .rpc()`}
                </CodeBlock>
              </div>
              <div>
                <p className="text-xs text-faint font-mono mb-2">2. Withdraw with passkey proof</p>
                <CodeBlock language="typescript">
{`// tx = [secp256r1ProofIx, registryVaultWithdrawIx]
// Proof is verified onchain. No bridge required.
const tx = new Transaction()
tx.add(buildSecp256r1Ix(pubKey, sig, payloadHash))
tx.add(withdrawIx)
await sendAndConfirmTransaction(connection, tx, [owner])`}
                </CodeBlock>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <Rule />
        <section id="faq" className="max-w-5xl mx-auto px-6 py-32">
          <Label>FAQ</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-12">
            Common questions
          </h2>

          <div className="max-w-2xl space-y-0" itemScope itemType="https://schema.org/FAQPage">
            {[
              {
                q: "What is Trana?",
                a: "Trana is an onchain authorization primitive for Solana. It enforces a second-factor passkey approval at the moment a transaction executes, not when it was signed. A stolen private key alone cannot trigger high-risk actions protected by the guard.",
              },
              {
                q: "How is Trana different from multisig?",
                a: "Multisig requires more signers but doesn't change when authorization happens. Signatures can still be collected in advance and replayed. Trana enforces approval at the exact moment of execution, closing the window attackers exploit.",
              },
              {
                q: "Can the guard be bypassed?",
                a: "No. The guard runs inside the Anchor program onchain. A raw transaction without a valid proof fails identically. There is no client-side component to bypass.",
              },
              {
                q: "What is execution-time authorization?",
                a: "It means the approval is verified at the moment the transaction executes onchain, not when it was signed. The passkey proof is cryptographically bound to the specific action, amount, recipient, and nonce. It cannot be reused or tampered with.",
              },
              {
                q: "Who is Trana for?",
                a: "Protocol administrators managing upgrade authority, DAO treasuries, vault operators, and any team where a single compromised key would cause irreversible damage.",
              },
            ].map(({ q, a }, i) => (
              <div
                key={q}
                itemScope itemProp="mainEntity" itemType="https://schema.org/Question"
                className={`py-6 border-b border-border ${i === 0 ? "border-t" : ""}`}
              >
                <h3 itemProp="name" className="font-medium text-ink text-base mb-2">{q}</h3>
                <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <p itemProp="text" className="text-muted text-sm leading-relaxed">{a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Philosophy / Closing ─────────────────────────────────────────── */}
        <Rule />
        <section className="max-w-5xl mx-auto px-6 py-44 text-center">
          <blockquote className="max-w-2xl mx-auto">
            <p className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight text-ink">
              &ldquo;Keys get stolen while you sleep.
              <br />
              <span className="italic">Execution only happens when the guard says yes.&rdquo;</span>
            </p>
          </blockquote>
          <p className="text-muted text-base mt-8 font-medium">
            Signatures can be collected early. Execution must be approved late.
          </p>
          <p className="text-faint text-sm mt-3">
            Trana · Onchain Authorization Primitive for Solana
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
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
              <span className="text-faint text-xs">© 2025</span>
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
                Colosseum Frontier Hackathon · April 2026
              </span>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
