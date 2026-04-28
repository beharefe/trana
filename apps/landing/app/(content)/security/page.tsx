import type { Metadata } from "next"
import Content from "./content.mdx"

export const metadata: Metadata = {
  title: "Security Model",
  description: "How Trana's zero-trust onchain second-factor authorization works. Full attack matrix, what Trana protects against, and what it does not.",
  alternates: { canonical: "https://trana.so/security" },
  openGraph: {
    type: "article",
    title: "Trana Security Model — Zero-Trust Onchain Authorization",
    description: "Full attack matrix. What the secp256r1 precompile guarantees. What Trana does and does not protect against.",
    images: [{ url: "https://trana.so/api/og?title=Security+Model&subtitle=Eight+attack+scenarios%2C+proof+pipeline%2C+and+trust+model.&section=Security", width: 1200, height: 630 }],
  },
}

export default function Page() {
  return <Content />
}
