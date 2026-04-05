import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Trana — Unstealable Transactions",
  description:
    "Even if your private key is compromised, high-risk actions still cannot execute. Trana enforces second-factor authorization at execution time — not signing time.",
  openGraph: {
    title: "Trana — Unstealable Transactions",
    description:
      "Execution-time authorization enforced onchain. Signatures are not authorization.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#0a0a0a] text-white antialiased">{children}</body>
    </html>
  )
}
