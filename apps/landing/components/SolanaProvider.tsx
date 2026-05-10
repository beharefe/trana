"use client"
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from "react"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import type { Adapter } from "@solana/wallet-adapter-base"
import { DEVNET_RPC } from "@/lib/devnet"

import "@solana/wallet-adapter-react-ui/styles.css"

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Adapter[]>([])

  useEffect(() => {
    // Instantiate adapters only on the client — wallet extensions
    // inject into window at runtime, so constructing during SSR
    // leaves adapters in a permanently disconnected state.
    import("@solana/wallet-adapter-wallets").then(({
      PhantomWalletAdapter,
      SolflareWalletAdapter,
      CoinbaseWalletAdapter,
      TrustWalletAdapter,
    }) => {
      setWallets([
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new CoinbaseWalletAdapter(),
        new TrustWalletAdapter(),
      ])
    })
  }, [])

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
