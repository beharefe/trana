import type { ReactNode } from "react"
import Link from "next/link"
import { Prose } from "@/components/Prose"
import { SiteNav } from "@/components/SiteNav"

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <SiteNav />

      <main className="px-6 py-16 pb-24">
        <Prose>
          {children}
        </Prose>
      </main>

      <footer className="border-t border-border px-6 pt-10 pb-8">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-8 mb-10 text-sm">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-3">Docs</p>
              <div className="flex flex-col gap-2 text-muted">
                <Link href="/protocol"         className="hover:text-ink transition-colors">Protocol</Link>
                <Link href="/docs/quickstart" className="hover:text-ink transition-colors">Quickstart</Link>
                <Link href="/docs/glossary"   className="hover:text-ink transition-colors">Glossary</Link>
                <Link href="/security"        className="hover:text-ink transition-colors">Security Model</Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-3">Compare</p>
              <div className="flex flex-col gap-2 text-muted">
                <Link href="/compare/multisig" className="hover:text-ink transition-colors">vs Multisig</Link>
                <Link href="/compare/para"     className="hover:text-ink transition-colors">vs Para</Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-ink mb-3">Community</p>
              <div className="flex flex-col gap-2 text-muted">
                <a href="https://x.com/beharefe" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">X @beharefe</a>
                <a href="https://t.me/beharefe" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">Telegram @beharefe</a>
                <a href="https://github.com/beharefe/trana-guard" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">GitHub</a>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs text-faint">
            <span>© 2026 Trana, Inc. All rights reserved.</span>
            <Link href="/" className="hover:text-muted transition-colors">trana.so</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
