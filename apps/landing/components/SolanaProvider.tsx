"use client"
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { DEVNET_RPC } from "@/lib/devnet"

import "@solana/wallet-adapter-react-ui/styles.css"

export function SolanaProvider({ children }: { children: React.ReactNode }) {

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
