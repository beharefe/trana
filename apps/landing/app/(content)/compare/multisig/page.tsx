import type { Metadata } from "next"
import Content from "./content.mdx"

export const metadata: Metadata = {
  title: "Trana vs Multisig",
  description: "Trana and Squads multisig solve different problems. Multisig is M-of-N governance. Trana is single-user, device-bound, instant second-factor authorization at execution time. They compose.",
  alternates: { canonical: "https://trana.so/compare/multisig" },
  openGraph: {
    type: "article",
    title: "Trana vs Squads Multisig — Which One Do You Need?",
    description: "Multisig coordinates governance. Trana enforces execution. Here's how to think about which problem you're solving.",
    images: [{ url: "https://trana.so/api/og?title=Trana+vs+Multisig&subtitle=Governance+vs+execution-time+enforcement.+They+solve+different+problems+%E2%80%94+and+compose.&section=Compare", width: 1200, height: 630 }],
  },
}

export default function Page() {
  return <Content />
}
