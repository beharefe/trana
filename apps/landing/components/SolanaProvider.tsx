"use client"
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

import "@/lib/browser-polyfills"
import { useEffect, useState } from "react"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { DEVNET_RPC } from "@/lib/devnet"

import "@solana/wallet-adapter-react-ui/styles.css"

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Wallet adapters depend on browser-only globals. Keep the interactive demo
  // out of the Workers SSR pass, then mount it normally in the browser.
  if (!mounted) return null

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
