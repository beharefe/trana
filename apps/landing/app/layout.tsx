import type { Metadata } from "next"
import "./globals.css"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trana.dev"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Trana — Unstealable Transactions on Solana",
    template: "%s | Trana",
  },
  description:
    "Trana is an onchain authorization primitive for Solana. It enforces a second-factor passkey approval at execution time — not signing time. A stolen private key alone cannot move your funds.",
  keywords: [
    "Solana security",
    "onchain authorization",
    "transaction guard",
    "execution-time authorization",
    "passkey Solana",
    "multisig alternative",
    "DAO treasury security",
    "DeFi exploit prevention",
    "Trana",
    "Anchor program security",
  ],
  authors: [{ name: "Trana" }],
  creator: "Trana",
  publisher: "Trana",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Trana",
    title: "Trana — Unstealable Transactions on Solana",
    description:
      "A stolen private key alone cannot execute high-risk actions. Trana enforces passkey authorization at execution time, directly onchain.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trana — Unstealable Transactions on Solana",
    description:
      "A stolen private key alone cannot execute high-risk actions. Trana enforces passkey authorization at execution time, directly onchain.",
    creator: "@tranadev",
  },
  category: "technology",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#F5F0E8] text-[#141414] antialiased">{children}</body>
    </html>
  )
}
