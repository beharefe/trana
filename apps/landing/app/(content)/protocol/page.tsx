import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Protocol",
  description: "How Trana works as an authorization layer on Solana. The full stack: FIDO2 device, Trana Guard, Anchor program, and Solana — with wallet signing in context.",
  alternates: { canonical: "https://trana.so/protocol" },
  openGraph: {
    type: "article",
    title: "Trana Protocol — Authorization Layer for Solana",
    description: "Where Trana sits in the stack. Two signers, one execution gate, zero custody.",
    images: [{ url: "https://trana.so/api/og?title=Protocol&subtitle=Two+signers.+One+execution+gate.+Zero+custody.&section=Protocol", width: 1200, height: 630 }],
  },
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconKey({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className={className}>
      <circle cx="7" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5L16 16M13 13.5l1.5-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconFido({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className={className}>
      <rect x="1" y="4" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="9" r="1.5" fill="currentColor" />
      <path d="M8.5 7h5M8.5 9h4M8.5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconShield({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className={className}>
      <path d="M9 1.5L2.5 4.5V9c0 3.5 2.8 6.5 6.5 7.5 3.7-1 6.5-4 6.5-7.5V4.5L9 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCode({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className={className}>
      <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 6.5h7M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconSolana({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className={className}>
      <path d="M3 5.5h10.5l1.5-2H4.5L3 5.5Z" fill="currentColor" />
      <path d="M3 9.5h10.5l1.5-2H4.5L3 9.5Z" fill="currentColor" opacity=".6" />
      <path d="M3 13.5h10.5l1.5-2H4.5L3 13.5Z" fill="currentColor" opacity=".35" />
    </svg>
  )
}

// ── Connector ─────────────────────────────────────────────────────────────────

function Connector({ accent = false }: { accent?: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div className={`w-px h-6 ${accent ? "bg-accent/40" : "bg-border"}`} />
    </div>
  )
}

// ── Stack row ─────────────────────────────────────────────────────────────────

function StackRow({
  icon,
  name,
  role,
  accent = false,
  faint = false,
  noBorder = false,
}: {
  icon: React.ReactNode
  name: string
  role: string
  accent?: boolean
  faint?: boolean
  noBorder?: boolean
}) {
  return (
    <div
      className={[
        "flex items-center justify-between px-5 py-4",
        !noBorder && "border-b border-border/50",
        accent ? "bg-accent/5 border-l-2 border-l-accent" : "bg-bg",
      ].filter(Boolean).join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className={accent ? "text-accent" : "text-ink"}>{icon}</span>
        <span className="text-sm font-medium text-ink tracking-tight">{name}</span>
      </div>
      <span className={`text-xs font-medium tracking-widest uppercase ${faint ? "text-faint" : accent ? "text-accent" : "text-muted"}`}>
        {role}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProtocolPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-faint mb-8">Protocol</p>

      <h1 className="font-serif text-4xl sm:text-5xl leading-tight tracking-tight mb-6">
        Where Trana sits
        <br />
        <span className="italic">in the stack.</span>
      </h1>

      <p className="text-muted text-lg leading-relaxed mb-4 max-w-xl">
        Every Trana-protected instruction needs two approvals: a standard Solana wallet signature and a live FIDO2 device proof. Both verified onchain. Neither alone is enough.
      </p>
      <p className="text-muted text-base leading-relaxed mb-16 max-w-xl">
        Trana Guard and the FIDO2 device ship as a pair. The guard is useless without the device. The device signature is useless without the guard in the program.
      </p>

      {/* ── Main diagram ──────────────────────────────────────────────────── */}
      <div className="mb-20">

        {/* Two signers */}
        <div className="grid grid-cols-2 gap-3 mb-1">

          {/* Left: Wallet */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2 border-b border-border/50 bg-card">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-faint">Standard Solana</span>
            </div>
            <div className="flex items-center justify-between px-4 py-4 bg-bg">
              <div className="flex items-center gap-2.5">
                <IconKey className="text-ink shrink-0" />
                <span className="text-sm font-medium text-ink tracking-tight">WALLET</span>
              </div>
              <span className="text-xs font-medium text-faint tracking-widest uppercase">Ed25519</span>
            </div>
          </div>

          {/* Right: FIDO2 + Guard paired group */}
          <div className="rounded-xl border-2 border-accent/30 overflow-hidden">
            <div className="px-4 py-2 border-b border-accent/20 bg-accent/5">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-accent">Trana — paired</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-accent/15 bg-bg">
              <div className="flex items-center gap-2.5">
                <IconFido className="text-ink shrink-0" />
                <span className="text-sm font-medium text-ink tracking-tight">PASSKEY / YUBIKEY</span>
              </div>
              <span className="text-xs font-medium text-faint tracking-widest uppercase">FIDO2 · P-256</span>
            </div>
            {/* mini connector inside the group */}
            <div className="flex justify-center py-1 bg-accent/3">
              <div className="w-px h-4 bg-accent/30" />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 bg-accent/5">
              <div className="flex items-center gap-2.5">
                <IconShield className="text-accent shrink-0" />
                <span className="text-sm font-medium text-ink tracking-tight">TRANA GUARD</span>
              </div>
              <span className="text-xs font-medium text-accent tracking-widest uppercase">Authorization</span>
            </div>
          </div>
        </div>

        {/* Merge connector — two lines from both cols converging */}
        <div className="flex items-end justify-around px-[25%] h-8">
          <div className="w-px flex-1 bg-border" />
          <div className="w-8 h-px bg-border" />
          <div className="w-px flex-1 bg-border" />
        </div>

        {/* Both required label */}
        <div className="flex justify-center mb-1">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-faint bg-bg px-3 -mt-3 relative z-10">
            both required
          </span>
        </div>

        {/* Lower stack */}
        <div className="rounded-xl border border-border overflow-hidden">
          <Connector />
          <StackRow
            icon={<IconCode />}
            name="ANCHOR PROGRAM"
            role="Your Code"
            faint
          />
          <Connector />
          <StackRow
            icon={<IconSolana />}
            name="SOLANA"
            role="Ledger + secp256r1"
            faint
            noBorder
          />
        </div>
      </div>

      {/* ── Layer explanations ────────────────────────────────────────────── */}
      <h2 className="font-serif text-3xl leading-tight tracking-tight mb-8">Each layer explained</h2>

      <div className="space-y-8 mb-16">
        <div className="p-6 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-3">
            <IconKey className="text-ink" />
            <span className="text-sm font-semibold text-ink">Wallet — Ed25519 signature</span>
            <span className="ml-auto text-[10px] font-medium tracking-widest uppercase text-faint">Standard Solana</span>
          </div>
          <p className="text-muted text-sm leading-relaxed">
            Your wallet key signs the transaction. Same as any other Solana program. Trana adds one requirement on top: that signature alone is no longer enough to execute.
          </p>
        </div>

        <div className="p-6 rounded-2xl border-2 border-accent/25 bg-accent/5">
          <div className="flex items-center gap-2 mb-1">
            <IconFido className="text-accent" />
            <span className="text-sm font-semibold text-ink">FIDO2 Device — P-256 signature</span>
            <span className="ml-auto text-[10px] font-medium tracking-widest uppercase text-accent">Trana — paired</span>
          </div>
          <p className="text-muted text-sm leading-relaxed mb-4">
            A passkey (Touch ID, Face ID, iCloud Keychain) or hardware key (YubiKey, Google Titan) holds a P-256 private key that never leaves the device. It signs an intent hash — a SHA-256 commitment to the exact action, parameters, accounts, program, nonce, and expiry.
          </p>
          <div className="border-t border-accent/20 pt-4 flex items-start gap-2">
            <IconShield className="text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink mb-1">Trana Guard — secp256r1 verification</p>
              <p className="text-muted text-sm leading-relaxed">
                The guard program verifies the P-256 signature using the Solana secp256r1 precompile (SIMD-0075, live since February 2025). It recomputes the intent hash from the live transaction at execution time and rejects anything that doesn't match. No server involved.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-3">
            <IconCode className="text-ink" />
            <span className="text-sm font-semibold text-ink">Anchor Program — your code</span>
            <span className="ml-auto text-[10px] font-medium tracking-widest uppercase text-faint">Your Code</span>
          </div>
          <p className="text-muted text-sm leading-relaxed">
            Your program calls <code className="font-mono text-xs bg-bg border border-border px-1.5 py-0.5 rounded">guard::cpi::enforce()</code> at the top of any instruction you want to protect. One CPI call. No changes to your account structure beyond adding three Trana accounts.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-3">
            <IconSolana className="text-ink" />
            <span className="text-sm font-semibold text-ink">Solana</span>
            <span className="ml-auto text-[10px] font-medium tracking-widest uppercase text-faint">Ledger + secp256r1</span>
          </div>
          <p className="text-muted text-sm leading-relaxed">
            Solana provides the ledger and, via SIMD-0075, a native secp256r1 signature verification instruction. This precompile is part of the validator software itself — not a Trana contract. It is the cryptographic root of trust.
          </p>
        </div>
      </div>

      {/* ── Properties ───────────────────────────────────────────────────── */}
      <h2 className="font-serif text-3xl leading-tight tracking-tight mb-6">Protocol properties</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
        {[
          { title: "Trustless", body: "Verification runs inside the Solana validator. Trana holds no admin key and no custody." },
          { title: "Non-custodial", body: "Your wallet key and your FIDO2 device are both under your control. No third party holds either." },
          { title: "Replay-proof", body: "The enforcement nonce increments after every successful proof. Captured proofs are useless on the next call." },
          { title: "Parameter-bound", body: "The intent hash commits to exact accounts and params. Any modification after approval fails verification." },
          { title: "Expiry-enforced", body: "Proofs expire in 120 seconds by default. No pre-collection, no timed replay attacks." },
          { title: "Composable", body: "Any Anchor program can add Trana protection with one CPI call. No vault, no migration, no custody change." },
        ].map(({ title, body }) => (
          <div key={title} className="p-5 rounded-2xl border border-border bg-card">
            <p className="text-sm font-semibold text-ink mb-1.5">{title}</p>
            <p className="text-muted text-sm leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link href="/docs/quickstart" className="px-6 py-2.5 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/90 transition-colors">
          Read the quickstart
        </Link>
        <Link href="/security" className="px-6 py-2.5 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors">
          Full attack matrix
        </Link>
      </div>
    </>
  )
}
