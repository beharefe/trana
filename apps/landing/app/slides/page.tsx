"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence, useInView, LayoutGroup } from "framer-motion"

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
// Phase timeline (~18s loop):
//   0  idle       — phone pulses (Touch ID)
//   1  key-born   — private key materialises on phone
//   2  key-stolen — key travels phone → attacker laptop
//   3  bypassed   — attacker tx fires, no guard, red stamp
//   4  trana-on   — passkey appears at phone, guard block lights up
//   5  blocked    — passkey travels to guard, attacker tx rejected, green stamp
//   6  pause

const PHASE_MS = [2200, 2200, 2400, 2600, 2400, 2600, 2800]

const NARRATION = [
  "Touch ID protects this wallet — biometric bound to device.",
  "The private key lives inside the app.",
  "Attacker compromises the device and steals the key.",
  "Attacker sends a raw transaction. Wallet 2FA is bypassed.",
  "Trana: passkey guard moves to the onchain instruction.",
  "Attacker sends again. Guard is onchain. Execution blocked.",
  "",
]

function usePhase(active: boolean) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) { setPhase(0); return }
    let dead = false
    ;(async () => {
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
      while (!dead) {
        for (let i = 0; i < PHASE_MS.length; i++) {
          if (dead) return
          setPhase(i)
          await wait(PHASE_MS[i])
        }
      }
    })()
    return () => { dead = true }
  }, [active])
  return phase
}

// ── Device shapes ─────────────────────────────────────────────────────────────

function PhoneDevice({ pulse }: { pulse: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* body */}
      <div className="relative w-11 h-[72px] rounded-[14px] bg-ink border-2 border-border overflow-hidden">
        {/* dynamic island */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-5 h-1.5 bg-card/30 rounded-full" />
        {/* screen glow */}
        <div className="absolute inset-[3px] top-5 rounded-[8px] bg-white/5" />
      </div>
      {/* home button */}
      <div className="relative flex items-center justify-center w-5 h-5">
        {pulse && (
          <>
            <motion.div className="absolute inset-0 rounded-full bg-accent/30"
              animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }} />
            <motion.div className="absolute inset-0 rounded-full bg-accent/20"
              animate={{ scale: [1, 2.4], opacity: [0.4, 0] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut", delay: 0.4 }} />
          </>
        )}
        <div className={`w-5 h-5 rounded-full border-2 transition-colors duration-300
          ${pulse ? "border-accent bg-accent/10" : "border-border bg-card"}`} />
      </div>
    </div>
  )
}

function LaptopDevice({ dim }: { dim: boolean }) {
  return (
    <motion.div animate={{ opacity: dim ? 0.2 : 1 }} transition={{ duration: 0.7 }}
      className="flex flex-col items-center">
      {/* lid */}
      <div className="w-20 h-12 rounded-t-lg bg-card border-2 border-border flex items-center justify-center">
        <div className="w-16 h-8 rounded bg-ink/8 border border-border/40" />
      </div>
      {/* base */}
      <div className="w-24 h-2.5 rounded-b-lg bg-card border-2 border-t-0 border-border" />
      {/* foot */}
      <div className="w-10 h-1 rounded-b bg-border mt-0" />
    </motion.div>
  )
}

function GuardBlock({ locked, shake }: { locked: boolean; shake: boolean }) {
  return (
    <motion.div
      animate={shake ? { x: [-4, 4, -4, 4, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <motion.div
        animate={{
          borderColor: locked ? "#16A34A" : "#D8D4CE",
          backgroundColor: locked ? "#DCFCE7" : "#EEECEA",
          scale: locked ? [1, 1.06, 1] : 1,
        }}
        transition={{ duration: 0.6 }}
        className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          {locked ? (
            <motion.svg key="locked" width="22" height="26" viewBox="0 0 22 26" fill="none"
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}>
              <rect x="1" y="10" width="20" height="15" rx="4" fill="#16A34A" fillOpacity="0.25"
                stroke="#16A34A" strokeWidth="1.8"/>
              <path d="M6 10V7A5 5 0 0116 7v3" stroke="#16A34A" strokeWidth="1.8"
                strokeLinecap="round" fill="none"/>
              <circle cx="11" cy="17.5" r="2.5" fill="#16A34A"/>
              <line x1="11" y1="19" x2="11" y2="22" stroke="#16A34A" strokeWidth="1.8"
                strokeLinecap="round"/>
            </motion.svg>
          ) : (
            <motion.svg key="unlocked" width="22" height="26" viewBox="0 0 22 26" fill="none"
              exit={{ opacity: 0 }}>
              <rect x="1" y="10" width="20" height="15" rx="4" stroke="#9E9A96" strokeWidth="1.8"
                strokeDasharray="3 2"/>
              <path d="M6 10V7A5 5 0 0116 7v3" stroke="#9E9A96" strokeWidth="1.8"
                strokeLinecap="round" fill="none"/>
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

// ── Tokens that travel using layoutId ────────────────────────────────────────

const tokenTransition = { layout: { type: "spring", stiffness: 90, damping: 20 } } as const

function KeyToken() {
  return (
    <motion.div layoutId="key" transition={tokenTransition}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-sm bg-amber-50 border border-amber-300">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="9" r="5.5" stroke="#d97706" strokeWidth="2"/>
        <path d="M13 13l7 7" stroke="#d97706" strokeWidth="2" strokeLinecap="round"/>
        <path d="M18 17l2-2M16 19l2-2" stroke="#d97706" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <span className="text-xs font-mono text-amber-700 leading-none">priv key</span>
    </motion.div>
  )
}

function PasskeyToken() {
  return (
    <motion.div layoutId="passkey" transition={tokenTransition}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-sm bg-accent-light border border-accent/40">
      <svg width="12" height="14" viewBox="0 0 24 28" fill="none">
        <path d="M12 2L3 6.5V14c0 5.8 3.8 11.2 9 13 5.2-1.8 9-7.2 9-13V6.5L12 2z"
          fill="#16A34A" fillOpacity="0.2" stroke="#16A34A" strokeWidth="2"/>
        <path d="M8 14l3 3 5-5" stroke="#16A34A" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-xs font-mono text-accent leading-none">passkey</span>
    </motion.div>
  )
}

// ── Dashed connector line with arrowhead ─────────────────────────────────────

function Connector({ active, danger }: { active: boolean; danger: boolean }) {
  const col = danger ? "#dc2626" : "#16A34A"
  return (
    <motion.div className="flex items-center self-start mt-[30px] flex-1 min-w-0 mx-2"
      animate={{ opacity: active ? 1 : 0.15 }}>
      <motion.div className="flex-1 h-px min-w-0"
        animate={{ backgroundImage: `repeating-linear-gradient(90deg,${col} 0,${col} 5px,transparent 5px,transparent 11px)` }}
        transition={{ duration: 0.5 }}
      />
      <div style={{
        borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
        borderLeft: `7px solid ${col}`,
      }} />
    </motion.div>
  )
}

// ── Main slide ────────────────────────────────────────────────────────────────

function WhyTranaSlide() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, margin: "-10%" })
  const phase  = usePhase(inView)

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
      <div className="h-5 mb-8 sm:mb-10">
        <AnimatePresence mode="wait">
          <motion.p key={phase}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="text-sm text-muted">
            {NARRATION[phase]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Scene — flex row with layoutId tokens */}
      <LayoutGroup>
        <div className="flex items-start justify-between sm:justify-center sm:gap-0 gap-2">

          {/* Phone */}
          <div className="flex flex-col items-center gap-3 w-24 sm:w-32 shrink-0">
            <PhoneDevice pulse={phase === 0} />
            <p className="text-xs text-faint uppercase tracking-widest">Phone</p>
            <div className="h-8 flex items-center">
              <AnimatePresence>
                {phase === 1 && (
                  <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                    <KeyToken />
                  </motion.div>
                )}
                {phase === 4 && (
                  <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}>
                    <PasskeyToken />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Connector active={phase >= 2 && phase <= 4} danger={true} />

          {/* Attacker */}
          <div className="flex flex-col items-center gap-3 w-24 sm:w-32 shrink-0">
            <LaptopDevice dim={phase < 2} />
            <p className="text-xs text-faint uppercase tracking-widest">Attacker</p>
            <div className="h-8 flex items-center">
              <AnimatePresence>
                {(phase >= 2 && phase <= 4) && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.3 }}>
                    <KeyToken />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Connector active={phase === 3 || phase === 5} danger={!blocked} />

          {/* Guard */}
          <div className="flex flex-col items-center gap-3 w-24 sm:w-32 shrink-0">
            <GuardBlock locked={phase >= 4} shake={blocked} />
            <p className="text-xs text-faint uppercase tracking-widest">
              {phase >= 4 ? "Guard ·  onchain" : "Guard"}
            </p>
            <div className="h-8 flex items-center">
              <AnimatePresence>
                {phase >= 5 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}>
                    <PasskeyToken />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </LayoutGroup>

      {/* Result stamp */}
      <div className="flex justify-center mt-6 h-10">
        <AnimatePresence mode="wait">
          {bypassed && (
            <motion.p key="bypassed"
              initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: -3 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="font-serif text-2xl font-bold italic tracking-widest text-red-600 border-2 border-red-400 px-5 py-0.5 rounded">
              Bypassed
            </motion.p>
          )}
          {blocked && (
            <motion.p key="blocked"
              initial={{ opacity: 0, scale: 0.7, rotate: 8 }}
              animate={{ opacity: 1, scale: 1, rotate: 2 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="font-serif text-2xl font-bold italic tracking-widest text-ink border-2 border-ink px-5 py-0.5 rounded">
              Rejected
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <motion.p animate={{ opacity: phase >= 4 ? 1 : 0.3 }} transition={{ duration: 0.7 }}
        className="text-xs text-faint mt-4 text-center leading-relaxed">
        {phase >= 4
          ? "No client-side component to bypass. A stolen key alone cannot execute."
          : "Wallet-level 2FA is bypassed by raw transactions. The chain has no way to object."}
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
      <div className="flex flex-col items-center justify-center h-full text-center px-8 sm:px-24">
        <p className="text-xs font-medium tracking-widest uppercase text-faint mb-8 sm:mb-10 border border-border rounded-full px-4 py-1.5">
          Solana · execution-time authorization
        </p>
        <h1 className="font-serif text-5xl sm:text-7xl leading-[1.1] tracking-tight text-ink mb-6 sm:mb-8">
          A signature is not<br />
          <span className="italic text-accent">enough anymore.</span>
        </h1>
        <p className="text-xl sm:text-2xl text-muted max-w-2xl leading-relaxed">
          Every major exploit today uses a valid signature.
        </p>
      </div>
    ),
  },

  // 1 — Problem
  {
    id: "problem",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>The Problem</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-10 sm:mb-12">
          Protocols trust signatures<br />
          <span className="italic">blindly.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {[
            ["Admin key is stolen", "A single compromised key is enough. No second check."],
            ["Attacker signs directly", "The transaction is valid. The chain cannot object."],
            ["Protocol is drained", "Funds gone in seconds. No approval was asked."],
          ].map(([title, body]) => (
            <Card key={title} className="p-6 sm:p-7">
              <p className="font-medium text-ink text-base mb-2">{title}</p>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-border pl-6 mt-auto">
          <p className="font-serif text-xl sm:text-2xl text-ink italic leading-snug">
            &ldquo;Crypto has authentication. It doesn&apos;t have authorization.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 2 — Insight
  {
    id: "insight",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>The Insight</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-4">
          February 2025 —<br />
          <span className="italic text-accent">the missing piece arrives.</span>
        </h2>
        <p className="text-muted text-lg sm:text-xl leading-relaxed mb-10 sm:mb-12 max-w-2xl">
          Solana ships SIMD-0075: native P-256 signature verification on every validator.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {[
            ["Passkeys already use P-256", "Touch ID, Face ID, YubiKey, Windows Hello — all produce P-256 signatures by design."],
            ["Now verifiable onchain", "For the first time: a passkey approval can be verified by the Solana runtime itself. No server. No bridge."],
          ].map(([title, body]) => (
            <Card key={title} className="p-6 sm:p-7">
              <p className="text-xs font-medium text-faint uppercase tracking-widest mb-3">{title}</p>
              <p className="text-base text-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-border pl-6 mt-auto">
          <p className="font-serif text-xl sm:text-2xl text-ink italic">
            &ldquo;This precompile is 3 months old. We are the first authorization primitive built on top of it.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 3 — Solution
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>The Solution</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-10 sm:mb-12">
          Trana Guard
        </h2>
        <div className="border border-border rounded-2xl bg-card p-7 sm:p-10 mb-8 sm:mb-10">
          <p className="text-xs font-medium text-faint uppercase tracking-widest mb-4">The guarantee</p>
          <p className="font-serif text-2xl sm:text-3xl text-ink leading-snug">
            &ldquo;This instruction cannot execute unless a second device explicitly approved it — right now, for exactly this action.&rdquo;
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-auto">
          {[
            ["Not replacing wallets", "We add a second layer. Everyday transactions work as usual."],
            ["No custody change", "Keys stay where they are. We add a second check at execution."],
            ["Enforced by the chain", "No server to compromise. No UI to bypass. Runtime enforced."],
          ].map(([title, sub]) => (
            <Card key={title} className="p-5 sm:p-6">
              <p className="font-medium text-ink text-sm mb-2">{title}</p>
              <p className="text-muted text-xs leading-relaxed">{sub}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 4 — Animation: Why Trana
  {
    id: "why-trana",
    render: () => <WhyTranaSlide />,
  },

  // 5 — Integration
  {
    id: "integration",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>For Developers</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-4">
          One line.<br />
          <span className="italic text-accent">Any Anchor program.</span>
        </h2>
        <p className="text-muted text-lg leading-relaxed mb-10 sm:mb-12">
          No new wallet. No custody change. No infrastructure.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 mt-auto">
          {/* Rust */}
          <div className="bg-ink rounded-2xl p-7 sm:p-8">
            <p className="text-faint text-xs uppercase tracking-widest mb-6">In your Anchor program</p>
            <div className="font-mono text-sm sm:text-base leading-relaxed space-y-1">
              <p className="text-faint text-sm">{"// protect any instruction"}</p>
              <p>
                <span className="text-accent">trana</span>
                <span className="text-bg/70">::enforce(</span>
              </p>
              <p className="pl-6">
                <span className="text-bg/60">&ctx,</span>
              </p>
              <p className="pl-6">
                <span className="text-accent">Policy</span>
                <span className="text-bg/70">::HighValue,</span>
              </p>
              <p><span className="text-bg/70">)?;</span></p>
            </div>
          </div>
          {/* TypeScript */}
          <div className="bg-ink rounded-2xl p-7 sm:p-8">
            <p className="text-faint text-xs uppercase tracking-widest mb-6">In your frontend</p>
            <div className="font-mono text-sm sm:text-base leading-relaxed space-y-1">
              <p className="text-faint text-sm">{"// SDK handles everything"}</p>
              <p>
                <span className="text-accent">await</span>
                <span className="text-bg/70"> trana</span>
              </p>
              <p className="pl-6">
                <span className="text-bg/60">.authorizeAndSend(</span>
              </p>
              <p className="pl-8">
                <span className="text-muted">tx</span>
              </p>
              <p className="pl-6"><span className="text-bg/70">)</span></p>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  // 6 — Demo / policies
  {
    id: "demo",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>Live Demo</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-4">
          The protocol defines<br />
          <span className="italic text-accent">when to ask.</span>
        </h2>
        <p className="text-muted text-lg sm:text-xl leading-relaxed mb-8 sm:mb-10 max-w-2xl">
          Policies are rules the developer declares in their program. When a rule triggers, execution is blocked until a passkey approves.
        </p>
        <div className="space-y-4 sm:space-y-5 mb-6 sm:mb-8">
          {[
            {
              rule:  "Require approval for any withdrawal above 1 SOL",
              why:   "Limits blast radius if a key is compromised.",
            },
            {
              rule:  "Require approval for admin instructions",
              why:   "Protocol upgrades and config changes need a second device.",
            },
            {
              rule:  "Require approval on every execution",
              why:   "Maximum protection for the most sensitive operations.",
            },
          ].map(({ rule, why }) => (
            <div key={rule} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 border border-border bg-card rounded-2xl px-6 py-5">
              <p className="font-medium text-ink text-base flex-1">{rule}</p>
              <p className="text-muted text-sm sm:text-right sm:max-w-xs shrink-0">{why}</p>
            </div>
          ))}
        </div>
        <Card className="p-5 sm:p-6 mt-auto">
          <p className="font-medium text-ink text-sm mb-1.5">Attack demo: attacker has the key, no passkey</p>
          <p className="text-muted text-sm">→ Transaction fails onchain. <span className="font-medium text-ink">The key alone is not enough.</span></p>
        </Card>
      </div>
    ),
  },

  // 7 — Where it matters
  {
    id: "where",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>Where This Matters</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-4">
          Protecting the most<br />
          <span className="italic text-accent">expensive mistakes.</span>
        </h2>
        <p className="text-muted text-lg sm:text-xl leading-relaxed mb-10 sm:mb-12 max-w-2xl">
          Not for every transaction. For the ones where a single leaked key would be catastrophic.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-auto">
          {[
            ["Protocol upgrades", "Upgrade authority requires a second device. A stolen admin key alone cannot deploy malicious code."],
            ["Treasury transfers", "Large disbursements are blocked without a device-bound approval at the moment of execution."],
            ["Vault withdrawals", "Collateral unlocks require explicit approval. No pre-signed transactions."],
            ["Admin actions", "Any irreversible onchain action. The exact operations where hacks happen."],
          ].map(([title, body]) => (
            <Card key={title} className="p-6 sm:p-7">
              <p className="font-medium text-ink text-base mb-2">{title}</p>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 8 — Market
  {
    id: "market",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>Market</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-10 sm:mb-12">
          Every protocol holding TVL<br />
          <span className="italic">needs this.</span>
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-8 sm:mb-10">
          <div className="border border-border rounded-2xl bg-card p-7 sm:p-10">
            <p className="text-xs font-medium text-faint uppercase tracking-widest mb-3">Solana TVL today</p>
            <p className="font-serif text-5xl sm:text-6xl text-ink">$7B+</p>
            <p className="text-sm text-muted mt-2">every dollar is a potential customer</p>
          </div>
          <div className="border border-border rounded-2xl bg-card p-7 sm:p-10">
            <p className="text-xs font-medium text-faint uppercase tracking-widest mb-3">Total addressable</p>
            <p className="font-serif text-5xl sm:text-6xl text-ink">$200B</p>
            <p className="text-sm text-muted mt-2">as P-256 verification spreads cross-chain</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-auto">
          {["DeFi protocols", "DAO treasuries", "Protocol admins", "Fintech & custodians"].map(uc => (
            <Card key={uc} className="p-4 sm:p-5">
              <p className="text-sm text-ink"><span className="text-accent mr-1.5">→</span>{uc}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Business
  {
    id: "business",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 pt-14 sm:pt-16 pb-8 overflow-y-auto">
        <Label>Business Model</Label>
        <h2 className="font-serif text-4xl sm:text-6xl leading-[1.1] tracking-tight text-ink mt-2 mb-10 sm:mb-12">
          Open primitive.<br />
          <span className="italic text-accent">Own the safety layer.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10 sm:mb-12">
          {[
            { n: "01", title: "Open core",     body: "The primitive is free and auditable. Managed registry, key recovery, and SLA are paid." },
            { n: "02", title: "Protocol fee",  body: "Micro-fee per guarded execution. As TVL grows, the fee grows with it." },
            { n: "03", title: "Enterprise SDK",body: "Audited builds and SLA for protocols and chains that want Trana guaranteed." },
          ].map(({ n, title, body }) => (
            <Card key={n} className="p-6 sm:p-7">
              <p className="text-xs font-mono text-faint mb-4">{n}</p>
              <p className="font-medium text-ink text-base mb-2">{title}</p>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-border pl-6 mt-auto">
          <p className="font-serif text-xl sm:text-2xl text-ink italic leading-snug">
            &ldquo;We don&apos;t hold keys. We don&apos;t hold custody. Protocols integrate once and we own the safety layer they depend on.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 10 — Close
  {
    id: "close",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 sm:px-24">
        <p className="text-xs font-medium tracking-widest uppercase text-faint mb-10 sm:mb-12">
          Colosseum Frontier · April 2026
        </p>
        <h2 className="font-serif text-5xl sm:text-7xl leading-[1.1] tracking-tight text-ink mb-8 sm:mb-10">
          Wallets made signing<br />
          <span className="italic">easier.</span>
        </h2>
        <p className="font-serif text-3xl sm:text-4xl text-accent italic mb-12 sm:mb-16">
          Trana makes execution safer.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 w-full max-w-3xl">
          {[
            ["Protocol partners", "DM us tonight. First integrations ship with us."],
            ["Colosseum",         "Infrastructure track. Demo is live."],
            ["Ecosystem grants",  "Open to Solana Foundation programs."],
          ].map(([title, body]) => (
            <Card key={title} className="text-left p-5 sm:p-6">
              <p className="font-medium text-ink text-sm mb-2">{title}</p>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
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
