import { Hero } from "@/components/Hero"
import { Section } from "@/components/Section"
import { DemoPanel } from "@/components/DemoPanel"
import { CodeBlock } from "@/components/CodeBlock"

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trana",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Solana",
  description:
    "Trana is an onchain authorization primitive for Solana that enforces second-factor passkey approval at transaction execution time. It prevents private key compromise from being sufficient to execute high-risk actions.",
  url: "https://trana.dev",
  creator: {
    "@type": "Organization",
    name: "Trana",
  },
  featureList: [
    "Execution-time authorization enforcement",
    "WebAuthn passkey integration",
    "Ed25519 proof verification via Solana Instructions sysvar",
    "Configurable risk policy engine",
    "Anchor program integration",
    "Replay attack prevention via monotonic nonces",
  ],
  keywords:
    "Solana security, onchain authorization, passkey, execution-time, DeFi security, DAO treasury",
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
        text: "Trana is an onchain authorization primitive for Solana. It enforces a second-factor passkey approval at the moment a transaction executes — not when it was signed. This means a stolen private key alone cannot trigger high-risk actions protected by the guard.",
      },
    },
    {
      "@type": "Question",
      name: "How is Trana different from multisig?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Multisig requires more signers but doesn't change when authorization happens. Signatures can still be collected in advance and replayed. Trana enforces approval at the exact moment of execution, closing the window between signing and execution that attackers exploit.",
      },
    },
    {
      "@type": "Question",
      name: "What attacks does Trana prevent?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Trana prevents social engineering attacks where valid signatures are obtained through phishing, durable nonce pre-signing attacks where transactions are signed days before execution, and any scenario where a private key is leaked without the attacker also controlling the passkey bridge.",
      },
    },
    {
      "@type": "Question",
      name: "Can the Trana guard be bypassed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The guard runs inside the Anchor program onchain. Bypassing the UI or constructing a raw transaction without a valid proof will still fail when the program verifies the Ed25519 proof via the Instructions sysvar. There is no client-side component that can be bypassed.",
      },
    },
    {
      "@type": "Question",
      name: "What is execution-time authorization?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Execution-time authorization means the approval for a transaction is verified at the moment the transaction executes onchain — not when it was signed by a wallet. Trana requires a passkey proof that is cryptographically tied to the specific action, amount, recipient, and nonce. This proof must be generated immediately before execution.",
      },
    },
    {
      "@type": "Question",
      name: "Who should use Trana?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Trana is designed for protocol administrators managing upgrade authority, DAO treasuries handling large disbursements, vault operators releasing collateral, and any application where a single compromised key would cause irreversible damage.",
      },
    },
  ],
}

function Divider() {
  return (
    <div className="max-w-4xl mx-auto px-6" aria-hidden>
      <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    </div>
  )
}

export default function Home() {
  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <main className="bg-[#0a0a0a] text-white">

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <nav
          aria-label="Main navigation"
          className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl"
        >
          <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
            <span className="font-semibold text-white tracking-tight">Trana</span>
            <a
              href="#demo"
              className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
            >
              Try demo →
            </a>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <Hero />

        {/* ── Problem ──────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="problem" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            The problem
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8 leading-tight">
            The exploit wasn&apos;t a weak key.
            <br />
            <span className="text-gray-400">It was an unconditional signature.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
            A single compromised signer moved $285M out of Drift Finance. The
            signature was cryptographically valid. The protocol had no mechanism
            to say no at execution time.
          </p>

          <div className="max-w-lg mx-auto space-y-3 text-left mb-12">
            {[
              "Signatures can be phished, forged, or stolen weeks before use",
              "Durable nonces let attackers pre-sign and execute days later",
              "A valid signature is unconditional — nothing on the execution path objects",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="text-red-400 mt-0.5 shrink-0">—</span>
                <p className="text-gray-400 text-base">{item}</p>
              </div>
            ))}
          </div>

          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border border-red-500/15 bg-red-500/5 max-w-md mx-auto">
            <p className="text-red-400/80 font-medium text-left leading-snug">
              The attack surface is not the key.
              It&apos;s the gap between signing and execution.
            </p>
          </div>
        </Section>

        {/* ── Solution ─────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="solution" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            The solution
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
            Authorization that lives
            <br />
            <span className="text-purple-400">at execution.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Trana closes that gap. Every protected transaction must carry a passkey
            proof generated for that specific action, amount, and nonce — moments
            before execution. No proof, no execution.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
            {[
              {
                icon: "🔑",
                label: "Proof required at execution",
                sub: "Not at signing time — at the moment the program runs",
              },
              {
                icon: "🎯",
                label: "Bound to exact details",
                sub: "Amount, recipient, and nonce are baked into the proof",
              },
              {
                icon: "⛓",
                label: "Enforced onchain",
                sub: "Ed25519 verification via the Instructions sysvar — no UI bypass possible",
              },
            ].map(({ icon, label, sub }) => (
              <div
                key={label}
                className="p-5 rounded-2xl border border-white/6 bg-white/[0.02] space-y-2"
              >
                <div className="text-2xl" aria-hidden>{icon}</div>
                <p className="text-white text-sm font-medium leading-snug">{label}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <Divider />
        <Section id="how-it-works" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            How it works
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            How the guard works
          </h2>
          <p className="text-gray-500 text-lg mb-12 max-w-md mx-auto">
            Every step is verified onchain. There are no exceptions.
          </p>

          <ol className="max-w-md mx-auto space-y-0" aria-label="How Trana works">
            {[
              {
                n: "01",
                label: "Transaction is constructed and signed by the user's wallet",
              },
              {
                n: "02",
                label: "The Trana guard evaluates the action against a configurable risk policy",
              },
              {
                n: "03",
                label: "If the policy triggers, a passkey approval is required — tied to the exact transaction details",
              },
              {
                n: "04",
                label: "The program verifies the Ed25519 proof onchain. No valid proof means the transaction fails — atomically.",
              },
            ].map(({ n, label }, i) => (
              <li key={n} className="flex items-start gap-5 text-left list-none">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full border border-purple-500/30 bg-purple-500/5 flex items-center justify-center">
                    <span className="text-purple-400 text-xs font-bold">{n}</span>
                  </div>
                  {i < 3 && <div className="w-px h-8 bg-white/6 my-1" />}
                </div>
                <p
                  className={`pt-1.5 text-base leading-relaxed ${
                    i === 3 ? "text-white font-medium" : "text-gray-400"
                  }`}
                >
                  {label}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── Demo ─────────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="demo" center={false}>
          <div className="text-center mb-10">
            <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-4">
              Interactive demo
            </p>
            <h2 className="text-4xl font-bold tracking-tight">
              The key is compromised.
            </h2>
            <p className="text-gray-400 mt-3 text-lg max-w-sm mx-auto">
              Watch the guard reject a raw withdrawal. Then approve it with a passkey.
            </p>
          </div>
          <DemoPanel />
        </Section>

        {/* ── Comparison ───────────────────────────────────────────────────── */}
        <Divider />
        <Section id="comparison" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            Comparison
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            How Trana compares
          </h2>
          <p className="text-gray-500 text-lg mb-12 max-w-md mx-auto">
            Other approaches protect keys. Trana protects execution.
          </p>

          <div className="max-w-2xl mx-auto overflow-hidden rounded-2xl border border-white/6">
            <table className="w-full text-sm" aria-label="Comparison table">
              <thead>
                <tr className="border-b border-white/6 bg-white/[0.02]">
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Approach</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">When enforced</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Key theft stops funds?</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["UI warning", "Never — client only", "No"],
                  ["Hardware wallet", "At signing time", "No — if key is extracted"],
                  ["Multisig", "At signing time", "No — signers can be compromised"],
                  ["Trana", "At execution time, onchain", "Yes"],
                ].map(([approach, when, stops], i) => (
                  <tr
                    key={approach}
                    className={`border-b border-white/4 last:border-0 ${
                      i === 3 ? "bg-purple-500/5" : ""
                    }`}
                  >
                    <td className={`px-5 py-4 font-medium ${i === 3 ? "text-purple-300" : "text-gray-300"}`}>
                      {approach}
                    </td>
                    <td className="px-5 py-4 text-gray-500">{when}</td>
                    <td className={`px-5 py-4 font-medium ${i === 3 ? "text-green-400" : "text-red-400/70"}`}>
                      {stops}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Use cases ────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="use-cases" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            Use cases
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Built for actions you can&apos;t afford to get wrong.
          </h2>
          <p className="text-gray-500 mb-12 text-lg max-w-md mx-auto">
            If a single leaked key would be catastrophic, Trana belongs in that path.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto text-left">
            {[
              {
                icon: "🏛",
                label: "Protocol admin",
                sub: "Upgrade authority, migration instructions, parameter changes",
              },
              {
                icon: "💰",
                label: "DAO treasury",
                sub: "Disbursements, budget allocations, emergency withdrawals",
              },
              {
                icon: "🔐",
                label: "Vault releases",
                sub: "Collateral unlocks, yield distributions, large transfers",
              },
              {
                icon: "⚡",
                label: "Critical operations",
                sub: "Any irreversible action with no recovery path",
              },
            ].map(({ icon, label, sub }) => (
              <div
                key={label}
                className="p-5 rounded-2xl border border-white/6 bg-white/[0.02] space-y-1.5"
              >
                <div className="text-xl" aria-hidden>{icon}</div>
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Developer ────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="developer" center>
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
            For developers
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Works with any Anchor program.
          </h2>
          <p className="text-gray-500 mb-8 text-base max-w-sm mx-auto">
            Add one call. The guard reads the Ed25519 proof from the Instructions
            sysvar and fails the transaction atomically if it&apos;s missing or invalid.
          </p>

          <div className="max-w-lg mx-auto">
            <CodeBlock language="rust">
{`guard.enforce(ctx, AdminAction::UpgradeAuthority);`}
            </CodeBlock>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500/50" />
              Anchor 0.32
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500/50" />
              Ed25519 Instructions sysvar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500/50" />
              WebAuthn passkey bridge
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500/50" />
              Monotonic nonce replay protection
            </span>
          </div>
        </Section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <Divider />
        <Section id="faq" center={false}>
          <div className="text-center mb-12">
            <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-4">
              FAQ
            </p>
            <h2 className="text-4xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-0" itemScope itemType="https://schema.org/FAQPage">
            {[
              {
                q: "What is Trana?",
                a: "Trana is an onchain authorization primitive for Solana. It enforces a second-factor passkey approval at the moment a transaction executes — not when it was signed. A stolen private key alone cannot trigger high-risk actions protected by the guard.",
              },
              {
                q: "How is Trana different from multisig?",
                a: "Multisig requires more signers but doesn't change when authorization happens. Signatures can still be collected in advance and replayed. Trana enforces approval at the exact moment of execution, closing the window attackers exploit.",
              },
              {
                q: "Can the guard be bypassed by constructing a raw transaction?",
                a: "No. The guard runs inside the Anchor program onchain. A raw transaction without a valid Ed25519 proof fails the same way a UI transaction would. There is no client-side component to bypass.",
              },
              {
                q: "What is execution-time authorization?",
                a: "It means the approval for a transaction is verified at the moment it executes onchain — not when it was signed. The passkey proof is cryptographically bound to the specific action, amount, recipient, and nonce, so it cannot be reused or tampered with.",
              },
              {
                q: "Who is Trana for?",
                a: "Protocol administrators managing upgrade authority, DAO treasuries handling large disbursements, vault operators, and any team where a single compromised key would cause irreversible damage.",
              },
            ].map(({ q, a }, i) => (
              <div
                key={q}
                itemScope
                itemProp="mainEntity"
                itemType="https://schema.org/Question"
                className={`py-6 border-b border-white/5 last:border-0 ${i === 0 ? "border-t border-white/5" : ""}`}
              >
                <h3
                  itemProp="name"
                  className="text-white font-medium text-base mb-3"
                >
                  {q}
                </h3>
                <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <p itemProp="text" className="text-gray-400 text-sm leading-relaxed">
                    {a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Philosophy ───────────────────────────────────────────────────── */}
        <Divider />
        <Section id="philosophy" center>
          <blockquote className="max-w-xl mx-auto space-y-2">
            <p className="text-2xl sm:text-3xl font-medium text-gray-400 leading-relaxed">
              &ldquo;Keys get stolen while you sleep.
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-white leading-relaxed">
              Execution only happens when the guard says yes.&rdquo;
            </p>
          </blockquote>
          <p className="text-gray-600 mt-8 text-sm">
            Trana — Onchain Authorization Primitive for Solana
          </p>
        </Section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/5 py-10">
          <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-600 text-sm">
              © 2025 Trana. Built on Solana.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <a
                href="https://github.com/beharefe/trana-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <span className="text-purple-400 text-xs font-medium">
                Solana Frontier Hackathon 2025
              </span>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
