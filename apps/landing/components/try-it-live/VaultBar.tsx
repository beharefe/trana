"use client"

import { useState } from "react"
import { Lock, X, ExternalLink, Wallet, ChevronDown } from "lucide-react"

// ── Seed phrase modal ─────────────────────────────────────────────────────────

// Replace with real phrase after devnet deploy
const SEED_PHRASE = "witch collapse practice feed shame open despair creek road again ice least"

function SeedPhraseModal({ onClose }: { onClose: () => void }) {
  const words = SEED_PHRASE.split(" ")
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,11,0.85)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-card p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[15px] text-ink tracking-[-0.01em]">
              Seed phrase
            </h3>
            <p className="text-[12.5px] text-muted mt-1 leading-relaxed">
              This wallet key is public. Funds are protected by passkey — not the key.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-faint hover:text-ink hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* words */}
        <div className="grid grid-cols-3 gap-2">
          {words.map((word, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] bg-bg"
            >
              <span className="font-mono text-[10px] text-faint w-4 shrink-0">{i + 1}</span>
              <span className="font-mono text-[12px] text-ink">{word}</span>
            </div>
          ))}
        </div>

        {/* notice */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-accent/20 bg-accent/[0.04]">
          <Lock size={12} className="text-accent shrink-0 mt-0.5" />
          <p className="font-mono text-[10.5px] text-accent/80 leading-relaxed">
            Try importing this wallet. You&apos;ll find you can&apos;t withdraw the vault funds — the program demands a passkey proof at execution time.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Wallet display ────────────────────────────────────────────────────────────

function WalletConnected({ address, balance }: { address: string; balance: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.14] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
    >
      <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
      <span className="font-mono text-[12px] text-ink">{address}</span>
      <span className="font-mono text-[12px] text-faint">{balance} SOL</span>
      <ChevronDown size={12} className="text-faint" />
    </button>
  )
}

// ── VaultBar ──────────────────────────────────────────────────────────────────

type Props = {
  /** vault balance — replace with live RPC value */
  vaultBalance?: string
  /** set to true once wallet adapter connected */
  connected?:    boolean
  walletAddress?: string
  walletBalance?: string
}

export function VaultBar({
  vaultBalance  = "—",
  connected     = false,
  walletAddress = "7xKp...nB7",
  walletBalance = "0.00",
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="not-prose mb-8 mt-2 px-5 py-3 rounded-xl border border-white/[0.08] bg-card flex flex-wrap items-center gap-3">

        {/* ── Left: vault stats ── */}
        <div className="flex items-center gap-3 mr-auto">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#ff5b1f]/30 bg-[#ff5b1f]/[0.06] font-mono text-[9px] tracking-[0.10em] text-[#ff5b1f] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff5b1f]" />
            devnet
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase">Vault</span>
            {/* balance → replace with live RPC */}
            <span className="font-mono text-[14px] font-medium text-ink">{vaultBalance} <span className="text-[11px] font-normal text-faint">SOL</span></span>
          </div>
        </div>

        {/* ── Right: actions ── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Seed phrase */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.10] font-mono text-[11px] text-faint hover:text-ink hover:border-white/[0.20] transition-colors"
          >
            <Lock size={11} />
            Seed phrase
          </button>

          {/* Get Devnet SOL */}
          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.10] font-mono text-[11px] text-faint hover:text-ink hover:border-white/[0.20] transition-colors no-underline"
          >
            Get devnet SOL
            <ExternalLink size={10} />
          </a>

          {/* Connect wallet / connected state */}
          {connected
            ? <WalletConnected address={walletAddress} balance={walletBalance} />
            : (
              /* onClick → open wallet adapter modal */
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/35 bg-accent/[0.06] font-mono text-[11px] text-accent hover:bg-accent/[0.12] transition-colors"
              >
                <Wallet size={11} />
                Connect wallet
              </button>
            )
          }
        </div>
      </div>

      {modalOpen && <SeedPhraseModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
