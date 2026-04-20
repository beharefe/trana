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
//
// Single continuous scene. 7 phases, ~18s loop:
//   0 — phone pulses (Touch ID)
//   1 — key materialises on phone
//   2 — key travels from phone → attacker laptop
//   3 — attacker fires raw tx → chain → Bypassed  (no guard)
//   4 — passkey travels from phone → guard block (Trana installs)
//   5 — attacker fires again → guard blocks → Rejected
//   6 — pause before loop

const P = [2000, 2000, 2200, 2200, 2400, 2200, 3000] // phase durations (ms)

// Horizontal positions of the 4 scene nodes (% of container width)
// Phone  Laptop  TX     Guard
const NX = ["5%", "32%", "58%", "82%"] as const

function useScene(active: boolean) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) { setPhase(0); return }
    let dead = false
    ;(async () => {
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
      while (!dead) {
        for (let i = 0; i < P.length; i++) {
          if (dead) return
          setPhase(i)
          await wait(P[i])
        }
      }
    })()
    return () => { dead = true }
  }, [active])
  return phase
}

function SceneNode({ x, icon, label, sub, pulse, lit, accent }: {
  x: string; icon: string; label: string; sub: string
  pulse?: boolean; lit?: boolean; accent?: boolean
}) {
  return (
    <div className="absolute top-0 flex flex-col items-center gap-1" style={{ left: x, transform: "translateX(-50%)" }}>
      <div className="relative">
        {pulse && (
          <motion.div
            className="absolute inset-[-6px] rounded-full bg-accent/25"
            animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <motion.div
          animate={{ opacity: lit ? 1 : 0.25 }}
          transition={{ duration: 0.5 }}
          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center text-xl border-2
            ${accent ? "border-accent bg-accent-light" : "border-border bg-card"}`}
        >
          {icon}
        </motion.div>
      </div>
      <motion.p animate={{ opacity: lit ? 1 : 0.3 }} className="text-xs font-medium text-ink leading-none">{label}</motion.p>
      <p className="text-xs text-faint leading-none">{sub}</p>
    </div>
  )
}

function SceneLine({ x0, x1, active, red, green }: {
  x0: string; x1: string; active: boolean; red?: boolean; green?: boolean
}) {
  const color = green ? "#16A34A" : red ? "#dc2626" : "#D8D4CE"
  return (
    <motion.div
      className="absolute h-px"
      style={{ left: x0, width: `calc(${x1} - ${x0})`, top: "22px" }}
      animate={{ opacity: active ? 1 : 0.18, backgroundColor: color }}
      transition={{ duration: 0.5 }}
    />
  )
}

// A token (key or passkey) that travels between node positions
function TravelToken({ emoji, fromX, toX, visible, row }: {
  emoji: string; fromX: string; toX: string; visible: boolean; row: number
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute text-base sm:text-lg select-none pointer-events-none"
          style={{ top: `${28 + row * 18}px` }}
          initial={{ left: fromX, opacity: 0, scale: 0.6 }}
          animate={{ left: toX, opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{
            left:    { duration: 1.4, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: 0.4 },
            scale:   { duration: 0.4 },
          }}
        >
          {emoji}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const NARRATION = [
  "Touch ID protects this wallet.",
  "Private key is accessible inside the device.",
  "Attacker steals the private key.",
  "Attacker signs a raw transaction — wallet 2FA is bypassed.",
  "Trana moves the passkey guard to the onchain instruction.",
  "Attacker signs again — onchain guard blocks execution.",
  "",
]

function WhyTranaSlide() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, margin: "-10%" })
  const phase  = useScene(inView)

  const keyLeft      = phase >= 2 ? NX[1] : NX[0]  // phone → laptop
  const passkeyLeft  = phase >= 5 ? NX[3] : NX[0]  // phone → guard (moves on phase 5)

  const bypassed = phase === 3
  const blocked  = phase === 5

  return (
    <div ref={ref} className="flex flex-col justify-center h-full px-6 sm:px-16 overflow-y-auto py-6">
      <Label>Why Trana</Label>
      <h2 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-ink mb-2">
        Moving the guard from wallet
        <span className="italic text-accent"> to the instruction.</span>
      </h2>

      {/* Narration */}
      <div className="h-5 mb-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-sm text-muted"
          >
            {NARRATION[phase]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Scene canvas */}
      <div className="relative w-full h-28 sm:h-32">

        {/* Connecting lines */}
        <SceneLine x0={NX[0]} x1={NX[1]} active={phase >= 2} red={phase >= 2 && phase < 4} />
        <SceneLine x0={NX[1]} x1={NX[2]} active={phase === 3 || phase === 5} red={bypassed} green={blocked} />
        <SceneLine x0={NX[2]} x1={NX[3]} active={phase === 3 || phase === 5} red={bypassed} green={blocked} />

        {/* Nodes */}
        <SceneNode x={NX[0]} icon="📱" label="Phone"    sub="user wallet"    pulse={phase === 0} lit={true} />
        <SceneNode x={NX[1]} icon="💻" label="Attacker" sub="raw signer"     pulse={false}       lit={phase >= 2} />
        <SceneNode x={NX[2]} icon="📄" label="TX"       sub=""               pulse={false}       lit={phase === 3 || phase === 5} />
        <SceneNode x={NX[3]} icon={phase >= 4 ? "🔒" : "⬜"} label="Guard" sub={phase >= 4 ? "onchain" : "not set"} pulse={blocked} lit={phase >= 4} accent={phase >= 4} />

        {/* Traveling key — moves phone → laptop on phase 2 */}
        <TravelToken emoji="🔑" fromX={NX[0]} toX={keyLeft} visible={phase >= 1 && phase <= 4} row={0} />

        {/* Traveling passkey — appears on phone at phase 4, travels to guard on phase 5 */}
        <TravelToken emoji="🛡️" fromX={NX[0]} toX={passkeyLeft} visible={phase >= 4} row={1} />

        {/* Result badge */}
        <div className="absolute right-0 bottom-0">
          <AnimatePresence mode="wait">
            {bypassed && (
              <motion.span key="bypassed"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="text-xs font-mono font-bold px-3 py-1 rounded-full border bg-red-50 text-red-600 border-red-200"
              >
                ✓ Bypassed
              </motion.span>
            )}
            {blocked && (
              <motion.span key="blocked"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="text-xs font-mono font-bold px-3 py-1 rounded-full border bg-ink text-bg border-ink"
              >
                ✗ Rejected
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer caption */}
      <motion.p
        animate={{ opacity: phase >= 4 ? 1 : 0.3 }}
        transition={{ duration: 0.6 }}
        className="text-xs text-faint mt-6 leading-relaxed max-w-lg"
      >
        {phase >= 4
          ? "Guard runs inside the Anchor instruction. No client-side component to bypass. A stolen key alone is not sufficient."
          : "Without Trana: wallet-level 2FA lives in the app — bypassed by sending raw transactions directly."}
      </motion.p>
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
