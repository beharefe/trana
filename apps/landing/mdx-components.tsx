import { useMDXComponents as getNextraDocsMDXComponents } from "nextra-theme-docs"
import type { MDXComponents } from "mdx/types"
import { CodeBlock } from "@/components/CodeBlock"

// ─── Shared table override ────────────────────────────────────────────────────
// Relaxed spacing + horizontal scroll so no column gets squished on mobile.

const tableComponents: MDXComponents = {
  table: ({ children }) => (
    <div className="my-8 -mx-1 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <table className="text-sm border-collapse min-w-[560px] w-full">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b-2 border-[rgba(255,255,255,0.1)]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left text-[11px] font-semibold uppercase tracking-wider py-3 px-5 text-faint whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="py-4 px-5 border-b border-[rgba(255,255,255,0.05)] align-top leading-relaxed text-muted">
      {children}
    </td>
  ),
}

// ─── Docs pages (/docs/*) — nextra/shiki handles code, prose, lists ──────────

const docsComponents: MDXComponents = {
  ...tableComponents,
  h1: ({ children }) => (
    <h1 className="font-serif text-[2.5rem] font-normal leading-tight mb-6">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-[1.75rem] font-normal leading-snug mt-12 mb-4 pb-2 border-b border-[rgba(255,255,255,0.08)]">{children}</h2>
  ),
}

// ─── Content pages (/security, /protocol, /compare) ──────────────────────────
// Standard Next.js MDX — no nextra/shiki, so we handle all prose + code.

function extractCodeProps(children: React.ReactNode): { code: string; language: string } {
  const el = children as React.ReactElement<{ children?: string; className?: string }>
  const className = el?.props?.className ?? ""
  const language  = className.replace("language-", "") || "text"
  const code      = (el?.props?.children ?? "").toString().trimEnd()
  return { code, language }
}

const contentComponents: MDXComponents = {
  ...tableComponents,
  h1: ({ children }) => (
    <h1 className="font-serif text-4xl font-normal leading-tight mt-0 mb-6 text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-2xl font-normal leading-snug mt-12 mb-4 pb-2 border-b border-[rgba(255,255,255,0.08)] text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-sans font-semibold text-lg text-ink mt-8 mb-3">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-sans font-semibold text-sm text-muted uppercase tracking-widest mt-6 mb-2">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-muted text-base leading-relaxed mb-5">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline underline-offset-2 hover:opacity-80 transition-opacity">{children}</a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-serif italic">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-5 pl-6 space-y-2 list-disc marker:text-faint">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-5 pl-6 space-y-2 list-decimal marker:text-faint">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-muted leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-5 my-6 font-serif italic text-muted">{children}</blockquote>
  ),
  code: ({ children, className, ...rest }: React.ComponentProps<"code">) => {
    if (className?.startsWith("language-")) {
      return <code className={className} {...rest}>{children}</code>
    }
    return (
      <code className="font-mono text-[0.8125rem] bg-card border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 text-accent">
        {children}
      </code>
    )
  },
  pre: ({ children }) => {
    const { code, language } = extractCodeProps(children)
    return <CodeBlock language={language} code={code} />
  },
  hr: () => <hr className="border-[rgba(255,255,255,0.08)] my-10" />,
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function getDocsMDXComponents(components?: MDXComponents) {
  const nextraComponents = getNextraDocsMDXComponents()
  return { ...nextraComponents, ...docsComponents, ...components }
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...contentComponents, ...components }
}
