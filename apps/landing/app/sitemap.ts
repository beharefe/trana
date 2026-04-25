import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trana.so"

const CONTENT_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "",                  priority: 1.0, changeFrequency: "weekly"  },
  { path: "/docs/quickstart",  priority: 0.9, changeFrequency: "monthly" },
  { path: "/protocol",         priority: 0.9, changeFrequency: "monthly" },
  { path: "/security",         priority: 0.9, changeFrequency: "monthly" },
  { path: "/compare/multisig", priority: 0.8, changeFrequency: "monthly" },
  { path: "/compare/para",     priority: 0.8, changeFrequency: "monthly" },
  { path: "/docs/glossary",    priority: 0.7, changeFrequency: "monthly" },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return CONTENT_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url:             `${BASE_URL}${path}`,
    lastModified:    new Date(),
    changeFrequency,
    priority,
  }))
}
