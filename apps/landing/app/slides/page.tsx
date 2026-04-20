"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence, useAnimate, useInView } from "framer-motion"

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-widest uppercase text-faint mb-4 sm:mb-6">
      {children}
    </p>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-4 sm:p-5 rounded-2xl border border-border bg-card ${className}`}>
      {children}
    </div>
  )
}

// ── Why Trana animated slide ──────────────────────────────────────────────────

const STEP_DURATION = 900   // ms per animation step
const ROW_DELAY     = 600   // ms between row starts
const LOOP_PAUSE    = 2200  // ms pause before loop restart

type RowStep = "idle" | "touch" | "key" | "sign" | "result"

function useRowLoop(startDelay: number, enabled: boolean) {
  const [step, setStep] = useState<RowStep>("idle")

  useEffect(() => {
    if (!enabled) { setStep("idle"); return }
    let cancelled = false

    async function run() {
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
      while (!cancelled) {
        await wait(startDelay)
        if (cancelled) break
        setStep("touch")
        await wait(STEP_DURATION)
        if (cancelled) break
        setStep("key")
        await wait(STEP_DURATION)
        if (cancelled) break
        setStep("sign")
        await wait(STEP_DURATION)
        if (cancelled) break
        setStep("result")
        await wait(LOOP_PAUSE)
        if (cancelled) break
        setStep("idle")
        await wait(300)
      }
    }
    run()
    return () => { cancelled = true }
  }, [startDelay, enabled])

  return step
}

function Pill({ children, color }: { children: React.ReactNode; color: "green" | "red" | "muted" }) {
  const cls = color === "green"
    ? "bg-accent-light text-accent border-accent/30"
    : color === "red"
    ? "bg-red-50 text-red-600 border-red-200"
    : "bg-card text-faint border-border"
  return (
    <span className={`inline-block text-xs font-mono font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  )
}

function PhoneIcon({ pulse, color }: { pulse: boolean; color: "green" | "red" }) {
  const ring = color === "green" ? "bg-accent/20" : "bg-red-400/20"
  const btn  = color === "green" ? "bg-accent/80"  : "bg-red-400/80"
  return (
    <div className="relative flex items-center justify-center">
      {pulse && (
        <motion.div
          className={`absolute w-10 h-10 rounded-full ${ring}`}
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <div className="w-8 h-8 rounded-full border-2 border-border bg-card flex items-center justify-center text-base">
        📱
      </div>
      <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-bg ${btn}`} />
    </div>
  )
}

function LaptopIcon() {
  return <div className="text-xl">💻</div>
}

function Arrow({ active, color }: { active: boolean; color: "green" | "red" }) {
  const c = color === "green" ? "#16A34A" : "#dc2626"
  return (
    <div className="flex items-center px-1">
      <motion.div
        animate={active ? { opacity: 1, x: 0 } : { opacity: 0.15, x: -4 }}
        transition={{ duration: 0.3 }}
        className="text-xs font-mono select-none"
        style={{ color: c }}
      >
        ──▶
      </motion.div>
    </div>
  )
}

function KeyBadge({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-mono text-amber-700"
        >
          🔑 <span className="hidden sm:inline">0x9f3a…</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BlockIcon({ locked, active }: { locked: boolean; active: boolean }) {
  return (
    <motion.div
      animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.35 }}
      className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl border-2 text-sm font-bold
        ${locked
          ? "border-accent bg-accent-light text-accent"
          : "border-border bg-card text-faint"}`}
    >
      {locked ? "🔒" : "⬜"}
    </motion.div>
  )
}

function ResultBadge({ step, outcome }: { step: RowStep; outcome: "ok" | "bypassed" | "blocked" }) {
  const visible = step === "result"
  const cfg = {
    ok:       { label: "✓ Executed",  cls: "bg-accent-light text-accent border-accent/30" },
    bypassed: { label: "✓ Bypassed!", cls: "bg-red-50 text-red-600 border-red-200" },
    blocked:  { label: "✗ Rejected",  cls: "bg-ink text-bg border-ink" },
  }[outcome]
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`text-xs font-mono font-bold px-3 py-1 rounded-full border ${cfg.cls}`}
        >
          {cfg.label}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Row({
  label, sublabel, icon, step, color, outcome, showGuard, guardLocked,
}: {
  label: string; sublabel: string
  icon: React.ReactNode
  step: RowStep
  color: "green" | "red"
  outcome: "ok" | "bypassed" | "blocked"
  showGuard?: boolean
  guardLocked?: boolean
}) {
  const rowColor = color === "green" ? "border-accent/20 bg-accent-light/30" : "border-red-200 bg-red-50/40"
  const signed = step === "sign" || step === "result"

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 rounded-2xl border px-4 sm:px-5 py-3 sm:py-4 ${rowColor}`}>
      {/* Label */}
      <div className="w-full sm:w-36 shrink-0">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="text-xs text-faint mt-0.5">{sublabel}</p>
      </div>

      {/* Actor */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1">
        <div className="shrink-0">{icon}</div>

        <Arrow active={step !== "idle"} color={color} />

        {/* Key pill */}
        <div className="w-24 flex justify-center">
          <KeyBadge visible={step === "key" || step === "sign" || step === "result"} />
        </div>

        <Arrow active={signed} color={color} />

        {/* TX block */}
        <motion.div
          animate={signed ? { opacity: 1 } : { opacity: 0.3 }}
          className="text-xs font-mono px-2 py-1 rounded-lg border border-border bg-card text-muted whitespace-nowrap"
        >
          tx
        </motion.div>

        {/* Guard block (Trana row only) */}
        {showGuard && (
          <>
            <Arrow active={signed} color={color} />
            <BlockIcon locked={!!guardLocked} active={signed} />
          </>
        )}

        <Arrow active={step === "result"} color={color} />

        <ResultBadge step={step} outcome={outcome} />
      </div>
    </div>
  )
}

function WhyTranaSlide() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, margin: "-10%" })

  const row1 = useRowLoop(0,              inView)
  const row2 = useRowLoop(ROW_DELAY,      inView)
  const row3 = useRowLoop(ROW_DELAY * 2,  inView)

  return (
    <div ref={ref} className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
      <Label>Why Trana</Label>
      <h2 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-ink mb-2">
        Moving 2FA from the wallet<br className="hidden sm:block" />
        <span className="italic text-accent"> to the chain.</span>
      </h2>
      <p className="text-muted text-sm mb-6 sm:mb-8 leading-relaxed">
        Wallet-level guards can be bypassed. Onchain enforcement cannot.
      </p>

      <div className="space-y-3">
        <Row
          label="Protected wallet"
          sublabel="2FA lives in the app"
          icon={<PhoneIcon pulse={row1 === "touch"} color="green" />}
          step={row1}
          color="green"
          outcome="ok"
        />

        <Row
          label="Attacker"
          sublabel="Stole the private key"
          icon={<LaptopIcon />}
          step={row2}
          color="red"
          outcome="bypassed"
        />

        <div className="flex items-center gap-3 py-1 pl-2">
          <div className="h-px flex-1 bg-border" />
          <p className="text-xs text-faint font-mono uppercase tracking-widest whitespace-nowrap">with Trana</p>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Row
          label="Attacker + Trana"
          sublabel="Guard is onchain"
          icon={<LaptopIcon />}
          step={row3}
          color="red"
          outcome="blocked"
          showGuard
          guardLocked
        />
      </div>

      <p className="text-xs text-faint mt-5 leading-relaxed max-w-lg">
        The guard runs inside the Anchor instruction. No client-side component to bypass.
        A stolen key alone is not sufficient.
      </p>
    </div>
  )
}

// ── Slides ────────────────────────────────────────────────────────────────────

const SLIDES = [
  // 0 — Title
  {
    id: "title",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 sm:px-16">
        <p className="text-xs font-medium tracking-widest uppercase text-faint mb-6 sm:mb-8 border border-border rounded-full px-4 py-1.5">
          Solana · devnet live
        </p>
        <h1 className="font-serif text-5xl sm:text-7xl leading-tight tracking-tight text-ink mb-4">
          Trana<span className="italic text-accent">Guard</span>
        </h1>
        <p className="text-lg sm:text-xl text-muted max-w-2xl leading-relaxed">
          Execution-time passkey enforcement for Solana
        </p>
        <div className="mt-10 sm:mt-12 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-faint">
          <span>No server</span>
          <span className="text-border">·</span>
          <span>No custodian</span>
          <span className="text-border">·</span>
          <span>Pure onchain</span>
        </div>
      </div>
    ),
  },

  // 1 — Problem
  {
    id: "problem",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>The Problem</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          Every Solana exploit<br className="hidden sm:block" />
          <span className="italic"> follows the same pattern.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {[
            ["01", "Attacker gets the private key"],
            ["02", "Sends raw transactions directly"],
            ["03", "Protocol is drained"],
          ].map(([n, t]) => (
            <Card key={n}>
              <p className="text-xs font-medium text-faint font-mono mb-3">{n}</p>
              <p className="text-sm font-medium text-ink">{t}</p>
            </Card>
          ))}
        </div>
        <Card>
          <p className="text-xs text-faint uppercase tracking-widest mb-3">Existing &ldquo;solutions&rdquo;</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
            <span className="text-muted">UI warnings <span className="text-ink font-medium">→ bypassed with raw tx</span></span>
            <span className="text-muted">Multisig <span className="text-ink font-medium">→ high coordination overhead</span></span>
            <span className="text-muted">Custodians <span className="text-ink font-medium">→ you&apos;re trusting them</span></span>
          </div>
        </Card>
      </div>
    ),
  },

  // 2 — Insight
  {
    id: "insight",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>The Insight</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-3">
          February 2025:<br />
          <span className="italic text-accent">Solana ships SIMD-0075.</span>
        </h2>
        <p className="text-muted text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed">
          Native secp256r1 (P-256) signature verification — on every validator.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            ["WebAuthn uses P-256", "Touch ID, Face ID, YubiKey, Windows Hello — all produce secp256r1 signatures by default."],
            ["Now verifiable onchain", "For the first time: passkeys can be verified natively by the Solana runtime. No server. No bridge."],
          ].map(([title, body]) => (
            <Card key={title}>
              <p className="text-xs font-medium text-faint uppercase tracking-widest mb-3">{title}</p>
              <p className="text-sm text-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-border pl-5 sm:pl-6">
          <p className="font-serif text-lg sm:text-xl text-ink leading-relaxed">
            &ldquo;SIMD-0075 is 3 months old. We&apos;re the first to build a production-grade authorization primitive on top of it.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 3 — Solution
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>The Solution</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6">
          One CPI call.<br />
          <span className="italic text-accent">Execution-time enforcement.</span>
        </h2>
        <div className="border border-border rounded-2xl bg-card p-5 sm:p-7 mb-6 sm:mb-8">
          <p className="text-xs font-medium text-faint uppercase tracking-widest mb-3">The guarantee</p>
          <p className="font-serif text-xl sm:text-2xl text-ink leading-relaxed">
            &ldquo;This instruction cannot execute unless the registered passkey signed an intent hash that exactly describes this transaction.&rdquo;
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
          {[
            ["Enforced by Solana runtime", "Not by a server or UI"],
            ["Atomic with execution", "Proof + action together"],
            ["Device-bound passkey", "Private key never leaves hardware"],
          ].map(([title, sub]) => (
            <Card key={title}>
              <p className="font-medium text-ink text-sm mb-1">{title}</p>
              <p className="text-muted text-xs">{sub}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 4 — How it works
  {
    id: "how",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>How It Works</Label>
        <h2 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          Transaction shape
        </h2>
        <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
          {[
            { ix: "N-2", name: "secp256r1 precompile", note: "Native P-256 sig verify (SIMD-0075)", highlight: false },
            { ix: "N-1", name: "guard::record_proof",  note: "Carries WebAuthn binding data",       highlight: false },
            { ix: "N",   name: "your_program::action", note: "→ calls guard::cpi::enforce()",       highlight: true  },
          ].map(({ ix, name, note, highlight }) => (
            <div key={ix} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border ${highlight ? "border-accent/40 bg-accent-light" : "border-border bg-card"}`}>
              <span className="text-xs font-mono font-medium text-faint shrink-0">ix[{ix}]</span>
              <span className="font-medium text-ink text-sm flex-1">{name}</span>
              <span className="text-muted text-xs">{note}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ["intent hash", "SHA-256(policy | program | accounts | params | nonce | expiry)"],
            ["nonce",       "Consumed on use — replay impossible"],
            ["atomic",      "All 3 succeed or all fail — runtime guarantee"],
          ].map(([k, v]) => (
            <Card key={k}>
              <p className="font-medium text-accent text-xs mb-1">{k}</p>
              <p className="text-muted text-xs leading-relaxed">{v}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 5 — Animation: Why Trana
  {
    id: "why-trana",
    render: () => <WhyTranaSlide />,
  },

  // 6 — Integration
  {
    id: "integration",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>The Integration</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-2 sm:mb-3">
          3 accounts. 1 call.<br />
          <span className="italic text-accent">That&apos;s everything.</span>
        </h2>
        <p className="text-muted text-base leading-relaxed mb-6 sm:mb-8">
          Copy this into your Anchor program. Ship it.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-ink rounded-2xl p-5 sm:p-6 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <p className="text-faint text-xs mb-3 uppercase tracking-widest">Rust / Anchor</p>
            <p className="text-faint">{"// 3 extra accounts"}</p>
            <p><span className="text-accent">pub</span> <span className="text-muted">guard_program</span><span className="text-bg/80">: Program{"<"}Guard{">"},</span></p>
            <p><span className="text-accent">pub</span> <span className="text-muted">trana_registry</span><span className="text-bg/80">: Account{"<"}Registry{">"},</span></p>
            <p><span className="text-accent">pub</span> <span className="text-muted">instructions</span><span className="text-bg/80">: UncheckedAccount,</span></p>
            <p className="mt-4 text-faint">{"// 1 CPI call"}</p>
            <p><span className="text-muted">guard</span><span className="text-bg/80">::cpi::</span><span className="text-accent">enforce</span><span className="text-bg/80">(cpi_ctx)?;</span></p>
          </div>
          <div className="bg-ink rounded-2xl p-5 sm:p-6 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <p className="text-faint text-xs mb-3 uppercase tracking-widest">TypeScript / SDK</p>
            <p className="text-faint">{"// SDK handles everything"}</p>
            <p><span className="text-accent">await</span> <span className="text-bg/80">authorizeAndSend{"({"}</span></p>
            <p className="pl-4"><span className="text-muted">buildIntent</span><span className="text-bg/80">: () ={">"} {"({"}</span></p>
            <p className="pl-8"><span className="text-bg/70">targetProgramId,</span></p>
            <p className="pl-8"><span className="text-bg/70">accounts, params,</span></p>
            <p className="pl-4"><span className="text-bg/80">{"}),"},</span></p>
            <p className="pl-4"><span className="text-muted">buildTransaction</span><span className="text-bg/80">: ...</span></p>
            <p><span className="text-bg/80">{"});"}</span></p>
          </div>
        </div>
      </div>
    ),
  },

  // 6 — Demo
  {
    id: "demo",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>Live Demo · Localnet</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          3 onchain policies. Working now.
        </h2>
        <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
          {[
            { id: "transfer.large",       label: "Large transfer",  rule: "≥ 1 SOL withdrawal" },
            { id: "transfer.rapid_drain", label: "Rapid drain",     rule: "Withdrawal within 5 min of ≥ 5 SOL deposit" },
            { id: "transfer.always",      label: "Always (opt-in)", rule: "Every withdrawal requires passkey" },
          ].map(({ id, label, rule }) => (
            <div key={id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 border border-border bg-card rounded-2xl p-3 sm:p-4">
              <span className="text-xs font-mono font-medium text-faint shrink-0">{id}</span>
              <span className="font-medium text-ink text-sm flex-1">{label}</span>
              <span className="text-muted text-xs">{rule}</span>
            </div>
          ))}
        </div>
        <Card>
          <p className="font-medium text-ink text-sm mb-1.5">Attack simulation — no proof, raw transaction</p>
          <p className="text-sm text-muted">
            → <span className="font-medium text-ink">MissingProof (0x1770)</span> — immediately, onchain, cannot be bypassed
          </p>
        </Card>
      </div>
    ),
  },

  // 7 — Attacks
  {
    id: "attacks",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>Security</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          Every attack vector has
          <br className="hidden sm:block" />
          <span className="italic text-accent"> a specific error code.</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 sm:mb-6">
          {[
            ["No proof in transaction",  "MissingProof",    "0x1770"],
            ["Replay old proof",         "PayloadMismatch", "nonce consumed"],
            ["Tamper amount",            "PayloadMismatch", "params_hash"],
            ["Swap recipient",           "PayloadMismatch", "accounts_hash"],
            ["Wrong passkey device",     "WrongSigner",     "pubkey check"],
            ["Expired proof (>2 min)",   "ProofExpired",    "Solana clock"],
          ].map(([attack, error, detail]) => (
            <Card key={attack}>
              <p className="text-muted text-xs mb-2 leading-snug">{attack}</p>
              <p className="font-medium text-ink text-xs sm:text-sm">{error}</p>
              <p className="text-faint text-xs mt-1 font-mono">{detail}</p>
            </Card>
          ))}
        </div>
        <Card>
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">ProofVerified</span> event emitted on every success —{" "}
            policy + program + nonce visible in every tx log. Zero-trust audit trail.
          </p>
        </Card>
      </div>
    ),
  },

  // 8 — Market
  {
    id: "market",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>Market</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          Every protocol holding TVL<br className="hidden sm:block" />
          <span className="italic"> needs this.</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-6">
          <div className="border border-border rounded-2xl bg-card p-5 sm:p-7">
            <p className="text-xs font-medium text-faint uppercase tracking-widest mb-2">Solana TVL</p>
            <p className="font-serif text-4xl sm:text-5xl text-ink">$7B+</p>
            <p className="text-xs text-muted mt-1">every dollar is a potential customer</p>
          </div>
          <div className="border border-border rounded-2xl bg-card p-5 sm:p-7">
            <p className="text-xs font-medium text-faint uppercase tracking-widest mb-2">Addressable</p>
            <p className="font-serif text-4xl sm:text-5xl text-ink">$200B</p>
            <p className="text-xs text-muted mt-1">multi-chain as secp256r1 spreads to EVM</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {["DeFi vaults", "DAO treasuries", "Protocol admins", "Fintech / custodians"].map(uc => (
            <Card key={uc}>
              <p className="text-sm text-ink"><span className="text-accent mr-1.5">→</span>{uc}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Viability
  {
    id: "viability",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>Viability</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          Open source primitive.<br />
          <span className="italic text-accent">Own the safety layer.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            { n: "01", title: "Open core",    body: "Primitive is free. Managed registry + SLA + key recovery is paid." },
            { n: "02", title: "Protocol fee", body: "Micro-fee per guarded transaction. TVL grows → fee grows." },
            { n: "03", title: "SDK licensing",body: "Enterprise support, audited builds, SLA for chains wanting Trana." },
          ].map(({ n, title, body }) => (
            <Card key={n}>
              <p className="text-xs font-mono text-faint mb-3">{n}</p>
              <p className="font-medium text-ink text-sm mb-2">{title}</p>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-border pl-5 sm:pl-6">
          <p className="font-serif text-lg sm:text-xl text-ink leading-relaxed">
            We don&apos;t hold custody. We don&apos;t hold keys. Protocols integrate once.{" "}
            <span className="italic text-accent">We own the safety layer they depend on.</span>
          </p>
        </div>
      </div>
    ),
  },

  // 10 — Team
  {
    id: "team",
    render: () => (
      <div className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
        <Label>Team + Why Us</Label>
        <h2 className="font-serif text-3xl sm:text-5xl leading-tight tracking-tight text-ink mb-6 sm:mb-8">
          We understand SIMD-0075<br className="hidden sm:block" />
          <span className="italic text-accent"> better than anyone building on it.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[
            ["Built from scratch",   "Rust program + TypeScript SDK + React provider — no boilerplate, no shortcuts"],
            ["Working demo tonight", "Not a slide. Not a mock. Live on localnet. Try to break it."],
            ["Open source",         "Every line auditable. github.com/beharefe/trana-guard"],
            ["Deep internals",      "secp256r1 DER→compact, WebAuthn binding, sysvar indexing — we wrote it all"],
          ].map(([title, body]) => (
            <Card key={title}>
              <p className="font-medium text-ink text-sm mb-1.5">{title}</p>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 11 — Ask
  {
    id: "ask",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 sm:px-20 overflow-y-auto py-6">
        <Label>The Ask</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-tight tracking-tight text-ink mb-4 mt-2">
          Ships to mainnet<br />
          <span className="italic text-accent">in 2 weeks.</span>
        </h2>
        <p className="text-muted text-base sm:text-lg mb-8 sm:mb-12 max-w-2xl leading-relaxed">
          We built an execution-time authorization layer for Solana.<br className="hidden sm:block" />
          Tonight you can try to hack it. You won&apos;t.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 w-full max-w-3xl mb-8 sm:mb-12">
          {[
            ["Protocol partners", "DM us tonight. First integrations ship with us."],
            ["Colosseum",         "This is our submission. Infrastructure track."],
            ["Ecosystem grants",  "Open to Solana Foundation programs."],
          ].map(([title, body]) => (
            <Card key={title} className="text-left">
              <p className="font-medium text-ink text-sm mb-2">{title}</p>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <p className="text-xs text-faint font-mono">github.com/beharefe/trana-guard · trana.so/slides</p>
      </div>
    ),
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Slides() {
  const [current, setCurrent] = useState(0)
  const [vis, setVis] = useState(true)
  const total = SLIDES.length

  const go = useCallback((next: number) => {
    if (next < 0 || next >= total) return
    setVis(false)
    setTimeout(() => { setCurrent(next); setVis(true) }, 100)
  }, [total])

  const next = useCallback(() => go(current + 1), [current, go])
  const prev = useCallback(() => go(current - 1), [current, go])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); next() }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")                    { e.preventDefault(); prev() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [next, prev])

  const slide = SLIDES[current]

  return (
    <div
      className="w-screen h-screen bg-bg overflow-hidden select-none cursor-pointer flex flex-col"
      onClick={next}
    >
      <div
        className="flex-1 min-h-0 transition-opacity duration-100"
        style={{ opacity: vis ? 1 : 0 }}
      >
        {slide.render()}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 sm:px-10 py-3 sm:py-4 border-t border-border shrink-0">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); go(i) }}
              className={`h-1.5 rounded-full transition-all ${i === current ? "bg-ink w-4" : "bg-border hover:bg-faint w-1.5"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            disabled={current === 0}
            className="text-xs text-faint hover:text-ink disabled:opacity-20 px-2 py-1 transition-colors"
          >
            ← prev
          </button>
          <span className="text-xs font-mono text-faint">{current + 1} / {total}</span>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            disabled={current === total - 1}
            className="text-xs text-faint hover:text-ink disabled:opacity-20 px-2 py-1 transition-colors"
          >
            next →
          </button>
        </div>
      </div>
    </div>
  )
}
