import type { Metadata } from "next"
import { SolanaProviders } from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "Trana Guard — Transaction Authorization Guard",
  description:
    "A Solana-native 2FA guard. Transactions fail without a valid passkey proof.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  )
}
