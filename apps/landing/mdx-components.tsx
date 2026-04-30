import { useMDXComponents as getNextraDocsMDXComponents } from "nextra-theme-docs"
import type { MDXComponents } from "mdx/types"

// ─── Shared table override (overflow-x-auto on both docs and content pages) ───

const tableComponents: MDXComponents = {
  table: ({ children }) => (
    <div className="overflow-x-auto my-6 rounded-lg border border-[rgba(255,255,255,0.08)]">
      <table className="w-full text-sm border-collapse min-w-[480px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left text-[11px] font-semibold uppercase tracking-wider py-3 px-4 border-b border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="py-3 px-4 border-b border-[rgba(255,255,255,0.06)] align-top leading-relaxed">
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
// These use the standard Next.js MDX loader (no nextra/shiki), so we must
// style everything ourselves.

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
  // Inline code vs block code — block code has a language-* className
  code: ({ children, className, ...rest }: React.ComponentProps<"code">) => {
    if (className?.startsWith("language-")) {
      return <code className={`${className} text-[0.875rem]`} {...rest}>{children}</code>
    }
    return (
      <code className="font-mono text-[0.8125rem] bg-card border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 text-accent">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-[#0d0e11] border border-[rgba(255,255,255,0.08)] rounded-xl p-5 overflow-x-auto my-6 text-[0.875rem] font-mono leading-relaxed text-[#e2e8f0]">
      {children}
    </pre>
  ),
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
