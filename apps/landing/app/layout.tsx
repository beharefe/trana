import type { Metadata } from "next"
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const instrumentSerif = Instrument_Serif({
  subsets:  ["latin"],
  weight:   "400",
  style:    ["normal", "italic"],
  display:  "swap",
  variable: "--font-serif",
})

const dmSans = DM_Sans({
  subsets:  ["latin"],
  weight:   ["300", "400", "500", "600"],
  display:  "swap",
  variable: "--font-sans",
})

const jetbrainsMono = JetBrains_Mono({
  subsets:  ["latin"],
  weight:   ["400", "500", "600"],
  display:  "swap",
  variable: "--font-mono",
})

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trana.so"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default:  "Trana — Execution-time authorization for Solana",
    template: "%s | Trana",
  },
  description:
    "Trana enforces second-factor authorization at execution time. High-risk Solana program actions do not execute without explicit approval — enforced onchain, not in your app.",
  keywords: [
    "Solana security",
    "onchain authorization",
    "execution-time authorization",
    "WebAuthn Solana",
    "FIDO2 Solana",
    "secp256r1 Solana",
    "SIMD-0075",
    "multisig alternative",
    "Trana",
    "Anchor program security",
    "trana_guard",
    "trana_authority",
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
    title:       "Trana — Execution-time authorization for Solana",
    description: "Two primitives for the authorization layer of Solana. Guard secures what can execute. Authority secures who can authorize.",
    locale:      "en_US",
    images:      [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, alt: "Trana — Execution requires authorization." }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Trana — Execution-time authorization for Solana",
    description: "Two primitives for the authorization layer of Solana. Guard secures what can execute. Authority secures who can authorize.",
    creator:     "@tranadev",
    images:      [`${BASE_URL}/api/og`],
  },
  category: "technology",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark scroll-smooth ${instrumentSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-bg text-ink antialiased font-sans">{children}</body>
    </html>
  )
}
