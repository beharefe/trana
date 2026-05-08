import type { Metadata } from "next"
import { Inter, DM_Serif_Display } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets:  ["latin"],
  weight:   ["300", "400", "500", "600"],
  display:  "swap",
  variable: "--font-inter",
})

const dmSerif = DM_Serif_Display({
  subsets:  ["latin"],
  weight:   "400",
  style:    ["normal", "italic"],
  display:  "swap",
  variable: "--font-serif",
})

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trana.so"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default:  "Trana — Unstealable Transactions on Solana",
    template: "%s | Trana",
  },
  description:
    "Trana is an onchain authorization primitive for Solana. It enforces a second-factor WebAuthn approval at execution time — not signing time. A stolen private key alone cannot execute protected actions.",
  keywords: [
    "Solana security",
    "onchain authorization",
    "execution-time authorization",
    "WebAuthn Solana",
    "FIDO2 Solana",
    "secp256r1 Solana",
    "SIMD-0075",
    "multisig alternative",
    "DAO treasury security",
    "DeFi exploit prevention",
    "Trana",
    "Anchor program security",
  ],
  authors:   [{ name: "Trana, Inc." }],
  creator:   "Trana, Inc.",
  publisher: "Trana, Inc.",
  robots: {
    index:     true,
    follow:    true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: BASE_URL },
  openGraph: {
    type:        "website",
    url:         BASE_URL,
    siteName:    "Trana",
    title:       "Trana — Unstealable Transactions on Solana",
    description: "A stolen private key alone cannot execute high-risk actions. Trana enforces WebAuthn second-factor authorization at execution time, directly onchain.",
    locale:      "en_US",
    images:      [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, alt: "Trana — Execution requires approval." }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Trana — Unstealable Transactions on Solana",
    description: "A stolen private key alone cannot execute high-risk actions. Trana enforces WebAuthn second-factor authorization at execution time, directly onchain.",
    creator:     "@tranadev",
    images:      [`${BASE_URL}/api/og`],
  },
  category: "technology",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark scroll-smooth ${inter.variable} ${dmSerif.variable}`}>
      <body className="bg-bg text-ink antialiased font-sans">{children}</body>
    </html>
  )
}
