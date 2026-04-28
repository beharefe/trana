import { useMDXComponents as getNextraDocsMDXComponents } from "nextra-theme-docs"
import type { MDXComponents } from "mdx/types"

const customComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="font-serif text-4xl text-ink leading-tight mt-0 mb-6">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-2xl text-ink leading-snug mt-12 mb-4 pb-2 border-b border-border">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-sans font-semibold text-base text-ink mt-8 mb-3">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-sans font-semibold text-sm text-muted uppercase tracking-widest mt-6 mb-2">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-muted text-base leading-relaxed mb-5">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors">
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-serif italic text-muted">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-5 space-y-2 pl-0 list-none">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-5 space-y-2 pl-0 list-none counter-reset-[item]">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-3 text-muted text-base leading-relaxed before:content-['—'] before:text-faint before:shrink-0">
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-5 my-6 font-serif italic text-lg text-muted">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="font-mono text-[13px] bg-card border border-border rounded px-1.5 py-0.5 text-ink">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-[#0f0f0f] text-[#e5e5e5] font-mono text-[13px] leading-relaxed rounded-xl p-5 overflow-x-auto my-6 border border-[#222]">
      {children}
    </pre>
  ),
  hr: () => (
    <hr className="border-border my-10" />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold text-ink py-2 px-3 text-xs uppercase tracking-wider">{children}</th>
  ),
  td: ({ children }) => (
    <td className="py-2.5 px-3 text-muted border-b border-border/50">{children}</td>
  ),
}

// For the docs catch-all page — includes Nextra's wrapper (TOC, breadcrumbs, etc.)
export function getDocsMDXComponents(components?: MDXComponents) {
  const nextraComponents = getNextraDocsMDXComponents()
  return { ...nextraComponents, ...customComponents, ...components }
}

// Standard Next.js MDX hook — for non-docs MDX pages (compare, security, etc.)
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...customComponents, ...components }
}
