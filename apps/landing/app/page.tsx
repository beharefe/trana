import { Hero } from "@/components/Hero"
import { Section } from "@/components/Section"
import { DemoPanel } from "@/components/DemoPanel"
import { CodeBlock } from "@/components/CodeBlock"

export default function Home() {
  return (
    <main className="bg-[#0a0a0a] text-white">

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-white tracking-tight">
            Trana
          </span>
          <a
            href="#demo"
            className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
          >
            Try demo →
          </a>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <Hero />

      {/* ── Problem ────────────────────────────────────────────────────────── */}
      <Section id="problem" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
          The problem
        </p>
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8 leading-tight">
          Signatures are not<br />authorization.
        </h2>
        <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          The Drift $285M exploit proved it:
        </p>

        <div className="max-w-lg mx-auto space-y-3 text-left mb-12">
          {[
            "Valid multisig signatures were socially engineered",
            "Durable nonces let attackers sign days in advance",
            "Once signed, execution was automatic",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <span className="text-red-400 mt-0.5 text-base shrink-0">→</span>
              <p className="text-gray-400 text-base">{item}</p>
            </div>
          ))}
        </div>

        <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border border-red-500/15 bg-red-500/5">
          <span className="text-2xl">⚠️</span>
          <p className="text-red-400/80 font-medium">
            sign once → execute forever is broken.
          </p>
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── Solution ───────────────────────────────────────────────────────── */}
      <Section id="solution" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
          The solution
        </p>
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
          Execution-Time
          <br />
          <span className="text-purple-400">Authorization</span>
        </h2>
        <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          Trana introduces a new primitive: transactions must be approved at execution —
          not just at signing.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
          {[
            {
              icon: "🔑",
              label: "Signature alone is not sufficient",
              sub: "Private key compromise doesn't grant execution",
            },
            {
              icon: "🛡",
              label: "Second-factor approval required",
              sub: "WebAuthn passkey verified by the bridge",
            },
            {
              icon: "⛓",
              label: "Enforced onchain",
              sub: "Ed25519 proof verified via Instructions sysvar",
            },
          ].map(({ icon, label, sub }) => (
            <div
              key={label}
              className="p-5 rounded-2xl border border-white/6 bg-white/[0.02] space-y-2"
            >
              <div className="text-2xl">{icon}</div>
              <p className="text-white text-sm font-medium leading-snug">{label}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <Section id="how-it-works" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
          How it works
        </p>
        <h2 className="text-4xl font-bold tracking-tight mb-12">
          Four steps.
          <br />
          <span className="text-gray-500">No exceptions.</span>
        </h2>

        <div className="max-w-md mx-auto space-y-0">
          {[
            { n: "01", label: "Transaction is created and signed" },
            { n: "02", label: "Guard evaluates risk against policy" },
            { n: "03", label: "Passkey approval required if policy triggers" },
            { n: "04", label: "Without approval → execution fails, onchain" },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-start gap-5 text-left">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-8 h-8 rounded-full border border-purple-500/30 bg-purple-500/5 flex items-center justify-center">
                  <span className="text-purple-400 text-xs font-bold">{n}</span>
                </div>
                {i < 3 && <div className="w-px h-8 bg-white/6 my-1" />}
              </div>
              <p className={`pt-1.5 text-base ${i === 3 ? "text-white font-medium" : "text-gray-400"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── Demo ───────────────────────────────────────────────────────────── */}
      <Section id="demo" center={false}>
        <div className="text-center mb-10">
          <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-4">
            Interactive Demo
          </p>
          <h2 className="text-4xl font-bold tracking-tight">
            Try the attack.
          </h2>
          <p className="text-gray-400 mt-3 text-lg">
            Then approve it with a passkey.
          </p>
        </div>
        <DemoPanel />
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── Use cases ──────────────────────────────────────────────────────── */}
      <Section id="use-cases" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
          Use Cases
        </p>
        <h2 className="text-4xl font-bold tracking-tight mb-3">
          Where Trana Matters Most
        </h2>
        <p className="text-gray-500 mb-12 text-lg">
          Any action where a leaked key would be catastrophic.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-left">
          {[
            { icon: "🏛", label: "Protocol admin", sub: "Upgrade authority, program migrations" },
            { icon: "💰", label: "DAO treasury", sub: "Disbursements requiring governance" },
            { icon: "🔐", label: "Vault withdrawals", sub: "High-value SOL and token releases" },
            { icon: "⚡", label: "Critical actions", sub: "Any irreversible onchain operation" },
          ].map(({ icon, label, sub }) => (
            <div
              key={label}
              className="p-5 rounded-2xl border border-white/6 bg-white/[0.02] space-y-1.5"
            >
              <div className="text-xl">{icon}</div>
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-gray-500 text-xs">{sub}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── Developer ──────────────────────────────────────────────────────── */}
      <Section id="dev" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-6">
          For Developers
        </p>
        <h2 className="text-4xl font-bold tracking-tight mb-4">
          One line of enforcement.
        </h2>
        <p className="text-gray-500 mb-8 text-base">
          Drop it into any Anchor program. The guard handles the rest.
        </p>

        <div className="max-w-lg mx-auto">
          <CodeBlock language="rust">
{`guard.enforce(ctx, AdminAction::UpgradeAuthority);`}
          </CodeBlock>
        </div>

        <p className="text-gray-600 text-sm mt-6 max-w-sm mx-auto">
          Verifies Ed25519 proof via Instructions sysvar.
          Fails atomically with the enclosing transaction.
        </p>
      </Section>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </div>

      {/* ── Philosophy ─────────────────────────────────────────────────────── */}
      <Section id="philosophy" center>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-8">
          Philosophy
        </p>
        <blockquote className="max-w-xl mx-auto space-y-3">
          <p className="text-2xl sm:text-3xl font-medium text-gray-300 leading-relaxed">
            "Signatures can be collected early.
          </p>
          <p className="text-2xl sm:text-3xl font-semibold text-white leading-relaxed">
            Execution must be approved late."
          </p>
        </blockquote>
        <p className="text-gray-600 mt-8 text-sm">
          Trana — Onchain Authorization Primitive
        </p>
      </Section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
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
  )
}
