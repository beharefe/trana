import { useMDXComponents as getNextraDocsMDXComponents } from "nextra-theme-docs"
import type { MDXComponents } from "mdx/types"

const customComponents: MDXComponents = {
  // Serif headings for brand identity — nextra handles everything else
  h1: ({ children }) => (
    <h1 className="font-serif text-[2.5rem] font-normal leading-tight mt-0 mb-6">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-[1.75rem] font-normal leading-snug mt-12 mb-4 pb-2 border-b border-[rgba(255,255,255,0.08)]">{children}</h2>
  ),
  // Horizontally scrollable tables
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

// For the docs catch-all page — merges nextra's wrapper (TOC, breadcrumbs, shiki) with our brand overrides
export function getDocsMDXComponents(components?: MDXComponents) {
  const nextraComponents = getNextraDocsMDXComponents()
  return { ...nextraComponents, ...customComponents, ...components }
}

// Standard Next.js MDX hook — for any non-docs MDX pages
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...customComponents, ...components }
}
