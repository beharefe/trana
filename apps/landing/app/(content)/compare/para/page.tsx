import type { Metadata } from "next"
import Content from "./content.mdx"

export const metadata: Metadata = {
  title: "Para vs Trana",
  description: "Para and Trana both use P-256 passkeys on Solana — but for completely different purposes. Para is wallet authentication. Trana is execution-time authorization. Here's the difference.",
  alternates: { canonical: "https://trana.so/compare/para" },
  openGraph: {
    type: "article",
    title: "Para vs Trana — Solana Passkey Authentication vs Execution-Time Authorization",
    description: "Para answers 'who is this user.' Trana answers 'should this instruction run.' Both questions matter.",
    images: [{ url: "https://trana.so/api/og?title=Para+vs+Trana&subtitle=Authentication+vs+authorization.+Para+answers+%E2%80%98who+is+this+user.%E2%80%99+Trana+answers+%E2%80%98should+this+run.%E2%80%99&section=Compare", width: 1200, height: 630 }],
  },
}

export default function Page() {
  return <Content />
}
