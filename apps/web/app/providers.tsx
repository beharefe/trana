"use client"

import { ReactNode, useMemo } from "react"
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react"
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PublicKey } from "@solana/web3.js"
import { TranaProvider, TranaModal } from "@trana-guard/sdk"

import "@solana/wallet-adapter-react-ui/styles.css"

const GUARD_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID || "BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb"
)

export function SolanaProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com"
  const wallets  = useMemo(() => [new PhantomWalletAdapter()], [])

  const tranaConfig = useMemo(() => ({
    guardProgramId: GUARD_PROGRAM_ID,
    policy:         "transfer.large",
    cluster:        "localnet",
    rpId:           process.env.NEXT_PUBLIC_RP_ID || "localhost",
    expiryTtlSec:   120,
  }), [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TranaProvider config={tranaConfig}>
            {children}
            <TranaModal />
          </TranaProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
