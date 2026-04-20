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
