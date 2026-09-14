import type { ReactNode } from "react"
import Link from "next/link"
import { SiteNav } from "@/components/SiteNav"

const docs = [
  ["/docs", "How it works"],
  ["/docs/quickstart", "Quickstart"],
  ["/docs/sdk", "SDK Reference"],
  ["/docs/integration", "Integration"],
  ["/docs/architecture", "Architecture"],
  ["/docs/glossary", "Glossary"],
] as const

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <div className="sec-wrap grid gap-10 py-10 md:grid-cols-[190px_minmax(0,760px)] md:py-14 lg:gap-16">
        <aside className="md:sticky md:top-[84px] md:self-start">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Documentation
          </p>
          <nav className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-1">
            {docs.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="border-l border-[var(--rule-2)] py-1.5 pl-3 text-sm text-muted transition-colors hover:border-[var(--lime)] hover:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 pb-16">{children}</article>
      </div>
      <footer className="border-t border-[var(--rule)] py-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        © 2026 Trana Guard
      </footer>
    </>
  )
}
