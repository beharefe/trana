// JSON-LD structured data injection — safe: content is JSON.stringify of
// our own data objects, never user input. Same pattern as page.tsx.

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trana.so"

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // eslint-disable-next-line react/no-danger
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD only, no user content
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function ArticleJsonLd({
  title,
  description,
  path,
  datePublished = "2026-04-25",
}: {
  title: string
  description: string
  path: string
  datePublished?: string
}) {
  return (
    <JsonLd data={{
      "@context":    "https://schema.org",
      "@type":       "TechArticle",
      headline:      title,
      description,
      url:           `${BASE_URL}${path}`,
      datePublished,
      dateModified:  new Date().toISOString().split("T")[0],
      author:        { "@type": "Organization", name: "Trana", url: BASE_URL },
      publisher:     { "@type": "Organization", name: "Trana", url: BASE_URL },
      inLanguage:    "en-US",
    }} />
  )
}

export function FaqJsonLd({ faqs }: { faqs: Array<{ q: string; a: string }> }) {
  return (
    <JsonLd data={{
      "@context":  "https://schema.org",
      "@type":     "FAQPage",
      mainEntity:  faqs.map(({ q, a }) => ({
        "@type":        "Question",
        name:           q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    }} />
  )
}

export function BreadcrumbJsonLd({ items }: { items: Array<{ name: string; path: string }> }) {
  return (
    <JsonLd data={{
      "@context":      "https://schema.org",
      "@type":         "BreadcrumbList",
      itemListElement: items.map(({ name, path }, i) => ({
        "@type":   "ListItem",
        position:  i + 1,
        name,
        item:      `${BASE_URL}${path}`,
      })),
    }} />
  )
}
