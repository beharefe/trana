"use client"

import { ReactNode, useMemo } from "react"
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react"
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css"

interface Props {
  children: ReactNode
}

export function SolanaProviders({ children }: Props) {
  const network = WalletAdapterNetwork.Devnet
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com"

  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
