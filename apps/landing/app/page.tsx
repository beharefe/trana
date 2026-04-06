import { Hero } from "@/components/Hero"

// ── Structured data ───────────────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trana",
  applicationCategory: "DeveloperApplication",
  description:
    "Trana is a system for deterministic client-side policy evaluation. Policies are defined once and evaluated locally at the point of execution.",
  url: "https://trana.dev",
  creator: { "@type": "Organization", name: "Trana" },
  featureList: [
    "Deterministic policy evaluation",
    "Client-side execution with no remote dependency",
    "Composable policy primitives",
    "Explicit, auditable enforcement paths",
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

      <main className="bg-bg text-ink">

        {/* ── Nav ────────────────────────────────────────────────────────────── */}
        <nav
          aria-label="Main navigation"
          className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md"
        >
          <div className="max-w-5xl mx-auto px-8 h-20 flex items-center justify-between">
            <span className="font-serif text-lg text-ink">Trana</span>
            <div className="flex items-center gap-6 text-sm text-muted">
              <a href="#spec" className="hover:text-ink transition-colors hidden sm:block">Read the spec</a>
              <a href="#architecture" className="hover:text-ink transition-colors hidden sm:block">View architecture</a>
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
                Most systems enforce policies
                <br />
                <span className="italic">on the server.</span>
              </h2>
              <p className="text-muted text-lg leading-relaxed mb-4">
                That means policy enforcement is remote, stateful, and opaque
                to the client making the call. The client has no way to know
                what rules apply, when they changed, or whether they ran at all.
              </p>
              <p className="text-muted text-base leading-relaxed">
                The enforcement gap is not a security edge case. It is the
                default architecture.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Decisions depend on remote state",
                  body: "Policy logic lives on a server that the client cannot inspect. What the client sends and what the server enforces can diverge silently.",
                },
                {
                  title: "Behavior is unpredictable without a network call",
                  body: "Access decisions require a round-trip. In degraded conditions, enforcement fails open or fails closed with no clear contract either way.",
                },
                {
                  title: "Enforcement is opaque to the client",
                  body: "The client cannot verify that the rules it believes apply are the rules actually being run. Auditing requires server-side access.",
                },
                {
                  title: "Distributed systems fragment the policy surface",
                  body: "As services multiply, each enforces rules independently. Subtle differences between enforcement points become the attack surface.",
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
          <div className="max-w-2xl mb-12">
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
              Policy defined once.
              <br />
              <span className="italic text-accent">Evaluated everywhere.</span>
            </h2>
            <p className="text-muted text-lg leading-relaxed">
              Trana is a system for deterministic client-side policy evaluation.
              Policies are defined once and evaluated locally at the point of
              execution. No server call. No ambiguity. The same rules run in
              every environment that includes the policy engine.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                n: "01",
                title: "Policy definition",
                body: "Policies are expressed as explicit, composable rule sets. What they check, what they require, and what they allow is fully readable before a single call runs.",
              },
              {
                n: "02",
                title: "Local evaluation",
                body: "The policy engine runs in the client. Evaluation happens at the call site with no remote dependency. The network is not in the enforcement path.",
              },
              {
                n: "03",
                title: "Deterministic outcome",
                body: "Given the same policy and the same inputs, evaluation always produces the same result. There is no server state that can change the answer between calls.",
              },
              {
                n: "04",
                title: "No runtime dependency",
                body: "Policy evaluation does not require a live service. It runs offline, in tests, in CI, and in production with identical behavior.",
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
        <section id="architecture" className="max-w-5xl mx-auto px-6 py-32">
          <Label>How it works</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                One path.
                <br />
                <span className="italic">No hidden branches.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed">
                The evaluation model is a directed tree. A policy node is either
                a primitive rule or a composition of rules. The engine walks the
                tree, evaluates each node against the local context, and returns
                a verdict. The same tree. The same walk. Every time.
              </p>
            </div>
            <ol className="space-y-0" aria-label="How Trana works">
              {[
                "Define a policy as a tree of explicit rules bound to a specific context type.",
                "At the call site, pass the local context to the policy engine. No network call is made.",
                "The engine evaluates the tree deterministically. Each node produces a binary result.",
                "The verdict is returned to the caller. Enforcement is the caller's responsibility. Policy is Trana's.",
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

        {/* ── Why it matters ───────────────────────────────────────────────── */}
        <Rule />
        <section id="why" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Why it matters</Label>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-3">
            The enforcement point
            <br />
            <span className="italic">is the property.</span>
          </h2>
          <p className="text-muted text-lg mb-12">
            Where policy runs determines what guarantees you can actually make.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Security",
                body: "A policy evaluated locally cannot be bypassed by a server configuration change, a network partition, or a degraded third-party service. The rules are present at the point of execution.",
              },
              {
                title: "Predictability",
                body: "The same inputs produce the same verdict in every environment. Developers can reason about policy behavior in tests without running a live service stack.",
              },
              {
                title: "Auditability",
                body: "Policy definitions are code. They live in version control, they diff cleanly, and they can be reviewed by anyone with read access to the repository. No dashboard required.",
              },
              {
                title: "Performance",
                body: "Evaluation is a local computation with no I/O. Latency is a function of policy complexity, not network conditions. High-frequency paths stay fast.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="p-6 rounded-2xl border border-border bg-card">
                <p className="font-medium text-ink text-sm mb-2">{title}</p>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Principles ───────────────────────────────────────────────────── */}
        <Rule />
        <section id="spec" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Principles</Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
                Explicit over implicit.
                <br />
                <span className="italic">Always.</span>
              </h2>
              <p className="text-muted text-base leading-relaxed">
                Every design decision in Trana follows from the same requirement:
                policy behavior must be fully knowable from the definition alone.
                No inference. No defaults that change. No hidden paths.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Deterministic by design",
                  body: "Policy evaluation is a pure function. Same policy, same context, same result. This is not a performance optimization. It is a correctness requirement.",
                },
                {
                  title: "Client-side first",
                  body: "The policy engine is designed to run where the call is made. Pushing evaluation to a remote service is always a degradation, not an upgrade.",
                },
                {
                  title: "Explicit over implicit",
                  body: "Every rule in a policy is written out. There are no defaults inherited from a global configuration, no fallback behaviors, no ambient permissions.",
                },
                {
                  title: "No hidden execution paths",
                  body: "The engine does not call out, cache remotely, or mutate state during evaluation. What the policy definition says is the complete specification of what will happen.",
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

        {/* ── Get started ──────────────────────────────────────────────────── */}
        <Rule />
        <section id="get-started" className="max-w-5xl mx-auto px-6 py-32">
          <Label>Get started</Label>
          <div className="max-w-2xl mb-12">
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-4">
              Start with the definition.
              <br />
              <span className="italic">The rest follows.</span>
            </h2>
            <p className="text-muted text-lg leading-relaxed">
              Trana is open source. The specification, the engine, and the
              reference implementation are all in the repository.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: "Read documentation",
                body: "The specification covers the policy model, evaluation semantics, and integration contract in full.",
                href: "https://github.com/beharefe/trana-guard/blob/main/docs/V1_POC.md",
                cta: "Read spec",
              },
              {
                title: "Explore the repository",
                body: "Source code, tests, and reference implementations for the policy engine and Solana integration.",
                href: "https://github.com/beharefe/trana-guard",
                cta: "View source",
              },
              {
                title: "Join technical discussion",
                body: "Questions, proposals, and implementation feedback belong in the repository issue tracker.",
                href: "https://github.com/beharefe/trana-guard/issues",
                cta: "Open issues",
              },
            ].map(({ title, body, href, cta }) => (
              <div key={title} className="p-6 rounded-2xl border border-border bg-card flex flex-col">
                <p className="font-medium text-ink text-sm mb-2">{title}</p>
                <p className="text-muted text-sm leading-relaxed flex-1 mb-5">{body}</p>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {cta} &rarr;
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── Closing ──────────────────────────────────────────────────────── */}
        <Rule />
        <section className="max-w-5xl mx-auto px-6 py-44 text-center">
          <blockquote className="max-w-2xl mx-auto">
            <p className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight text-ink">
              &ldquo;Policy that runs remotely
              <br />
              <span className="italic">is a promise, not a guarantee.&rdquo;</span>
            </p>
          </blockquote>
          <p className="text-muted text-base mt-8 font-medium">
            Evaluate locally.
            <span className="text-accent"> Enforce deterministically.</span>
          </p>
          <p className="text-faint text-sm mt-3">
            Trana · Deterministic Policy Engine
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
              href="#spec"
              className="px-7 py-3 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
            >
              Read the spec
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
                Colosseum Frontier Hackathon · April 2026
              </span>
            </div>
          </div>
        </footer>

      </main>
    </>
  )
}
