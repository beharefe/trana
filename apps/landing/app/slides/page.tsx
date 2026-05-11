"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { TranaWordmark } from "../../components/Logo"

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6 sm:mb-8">
      <span className="block w-6 h-px bg-accent shrink-0" />
      <p className="text-[10px] sm:text-[11px] font-mono font-semibold tracking-[0.24em] uppercase text-faint">
        {children}
      </p>
    </div>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-5 sm:p-7 rounded-2xl border border-border bg-card ${className}`}>
      {children}
    </div>
  )
}

// ── Guard animation types & helpers ──────────────────────────────────────────

type StageState = "idle" | "active" | "done" | "challenge" | "verified"

interface AnimState {
  wallet: StageState; guard: StageState; program: StageState
}

const ANIM_IDLE: AnimState = { wallet: "idle", guard: "idle", program: "idle" }

function waitMs(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function WalletIcon() {
  return (
    <svg className="w-9 h-9 sm:w-10 sm:h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H4a1 1 0 0 1-1-1Z"/>
      <path d="M3 7a1 1 0 0 1 1-1h13M16 13h2"/>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-9 h-9 sm:w-10 sm:h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V6l-8-3Z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  )
}

function ProgramIcon() {
  return (
    <svg className="w-9 h-9 sm:w-10 sm:h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="0.5"/>
      <rect x="9" y="9" width="6" height="6" rx="0.5"/>
      <path d="M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2"/>
    </svg>
  )
}

// ── Horizontal node ───────────────────────────────────────────────────────────

function HNode({ num, icon, role, name, meta, state }: {
  num: string; icon: React.ReactNode; role: string; name: string; meta: string; state: StageState
}) {
  const isActive    = state === "active"
  const isDone      = state === "done"
  const isChallenge = state === "challenge"
  const isVerified  = state === "verified"

  let borderColor = "var(--rule)",         bg         = "var(--ink)"
  let glyphBorder = "var(--rule-2)",        glyphColor = "var(--bone-2)"
  let dotColor    = "var(--bone-5)",        dotClass   = ""

  if (isActive) {
    borderColor = "rgba(90,169,255,0.55)";  bg         = "rgba(90,169,255,0.04)"
    glyphBorder = "var(--azure)";           glyphColor = "var(--azure)"
    dotColor    = "var(--azure)";           dotClass   = "animate-dot-azure"
  } else if (isDone) {
    borderColor = "rgba(198,255,58,0.45)";  bg         = "rgba(198,255,58,0.025)"
    glyphBorder = "var(--lime)";            glyphColor = "var(--lime)"
    dotColor    = "var(--lime)"
  } else if (isChallenge) {
    borderColor = "rgba(255,168,76,0.55)";  bg         = "rgba(255,168,76,0.05)"
    glyphBorder = "var(--plasma)";          glyphColor = "var(--plasma)"
    dotColor    = "var(--plasma)";          dotClass   = "animate-dot-amber"
  } else if (isVerified) {
    borderColor = "rgba(198,255,58,0.55)";  bg         = "rgba(198,255,58,0.06)"
    glyphBorder = "var(--lime)";            glyphColor = "var(--lime)"
    dotColor    = "var(--lime)"
  }

  return (
    <div
      className={`relative flex flex-col items-center gap-5 p-7 sm:p-8 will-change-transform overflow-hidden ${isChallenge ? "animate-guard-shake" : ""}`}
      style={{
        border: `1px solid ${borderColor}`,
        background: bg,
        transition: isChallenge ? "none" : "border-color 240ms, background 240ms",
        width: "clamp(175px, 24vw, 290px)",
        minWidth: 0,
      }}
    >
      <span
        className="absolute top-[-10px] left-[-10px] w-[24px] h-[24px] flex items-center justify-center font-mono text-[11px]"
        style={{ background: "var(--ink)", border: "1px solid var(--rule-2)", color: "var(--bone-3)" }}
      >
        {num}
      </span>

      <div
        className={`flex items-center justify-center shrink-0 ${isVerified ? "animate-glyph-flash" : ""}`}
        style={{ border: `1px solid ${glyphBorder}`, background: "var(--ink-2)", color: glyphColor, width: "4.5rem", height: "4.5rem" }}
      >
        {icon}
      </div>

      <div className="text-center w-full min-w-0">
        <div className="font-mono text-[13px] tracking-[0.2em] uppercase mb-1 truncate" style={{ color: "var(--bone-4)" }}>{role}</div>
        <div className="font-serif text-[26px] sm:text-[30px] leading-none mb-2 truncate" style={{ color: "var(--bone)" }}>{name}</div>
        <div className="font-mono text-[14px] truncate" style={{ color: "var(--bone-3)" }}>{meta}</div>
      </div>

      <div className="flex items-center justify-center h-4">
        {isVerified ? (
          <svg className="animate-check-draw w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden style={{ color: dotColor }}>
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
        ) : (
          <span className={`w-2 h-2 rounded-full ${dotClass}`} style={{ background: dotColor }} />
        )}
      </div>

      {isActive && (
        <div className="absolute left-0 right-0 bottom-0 h-[2px] animate-prog-bar" style={{ background: "var(--azure)" }} />
      )}
    </div>
  )
}

// ── Horizontal connector ──────────────────────────────────────────────────────

function HConnector({ rightState }: { rightState: StageState }) {
  const col = rightState === "idle"
    ? "var(--rule-2)"
    : (rightState === "done" || rightState === "verified")
      ? "var(--lime)"
      : "var(--azure)"

  return (
    <div className="flex items-center shrink-0" style={{ width: "clamp(48px, 6vw, 88px)" }}>
      <div style={{
        flex: 1, height: "1px",
        backgroundImage: `repeating-linear-gradient(90deg,${col} 0,${col} 5px,transparent 5px,transparent 11px)`,
        transition: "background-image 400ms",
      }} />
      <div style={{
        borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
        borderLeft: `10px solid ${col}`,
        transition: "border-left-color 400ms",
      }} />
    </div>
  )
}

// ── Horizontal guard slide ────────────────────────────────────────────────────

function WhyTranaSlide() {
  const cancelRef = useRef(false)
  const ref       = useRef<HTMLDivElement>(null)
  const inView    = useInView(ref, { once: false, margin: "-10%" })
  const [anim, setAnim] = useState<AnimState>(ANIM_IDLE)
  const [msg, setMsg]   = useState("Waiting for transaction…")

  useEffect(() => {
    if (!inView) { setAnim(ANIM_IDLE); setMsg("Waiting for transaction…"); return }
    cancelRef.current = false

    async function cycle() {
      setAnim(ANIM_IDLE)
      setMsg("Waiting for transaction…")
      await waitMs(900); if (cancelRef.current) return

      setAnim(st => ({ ...st, wallet: "active" }))
      setMsg("Wallet building and signing the transaction…")
      await waitMs(1400); if (cancelRef.current) return

      setAnim(st => ({ ...st, wallet: "done", guard: "active" }))
      setMsg("Trana Guard evaluating secp256r1 proof…")
      await waitMs(1200); if (cancelRef.current) return

      setAnim(st => ({ ...st, guard: "challenge" }))
      setMsg("Touch ID / Face ID required. Awaiting P-256 assertion…")
      await waitMs(3000); if (cancelRef.current) return

      setAnim(st => ({ ...st, guard: "verified" }))
      setMsg("Passkey verified. Execution authorized.")
      await waitMs(1100); if (cancelRef.current) return

      setAnim(st => ({ ...st, guard: "done", program: "active" }))
      setMsg("vault::withdraw executing · 2.500 SOL…")
      await waitMs(1600); if (cancelRef.current) return

      setAnim(st => ({ ...st, program: "done" }))
      setMsg("Transaction committed · sig 4xR…q9N")
      await waitMs(3200)
    }

    async function loop() { while (!cancelRef.current) await cycle() }
    loop()
    return () => { cancelRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  return (
    <div ref={ref} className="flex flex-col justify-center h-full px-8 sm:px-20 lg:px-28 overflow-y-auto py-8">
      <Label>Why Trana</Label>
      <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight tracking-tight text-ink mb-3">
        Moving the guard from wallet
        <span className="italic text-accent"> to the instruction.</span>
      </h2>
      <p className="text-muted text-base sm:text-lg mb-10 sm:mb-14 max-w-2xl">
        No client-side component to bypass. A stolen key alone cannot execute.
      </p>

      {/* Horizontal flow */}
      <div className="flex items-center justify-center">
        <HNode num="01" state={anim.wallet} role="Caller · signer"   name="Wallet"         meta="7Tg…dmLmS · tx"   icon={<WalletIcon />} />
        <HConnector rightState={anim.guard} />
        <HNode num="02" state={anim.guard}  role="CPI · policy gate" name="Trana Guard"     meta="require · proof"  icon={<ShieldIcon />} />
        <HConnector rightState={anim.program} />
        <HNode num="03" state={anim.program} role="Your program"     name="vault::withdraw" meta="executes on PASS" icon={<ProgramIcon />} />
      </div>

      {/* Status message */}
      <div className="flex items-center justify-center mt-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={msg}
            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="font-mono text-xs sm:text-sm tracking-wide text-center"
            style={{ color: "var(--bone-3)" }}
          >
            {msg}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Slides ────────────────────────────────────────────────────────────────────

const SLIDES = [
  // 0 — Title
  {
    id: "title",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 sm:px-24 gap-6 sm:gap-9">
        <div className="text-5xl sm:text-7xl">
          <TranaWordmark size="1em" />
        </div>
        <h1 className="font-serif text-[3.4rem] sm:text-[5.5rem] lg:text-[7rem] leading-[1.03] tracking-tight text-ink">
          Stolen keys can&apos;t drain<br />
          <span className="italic text-accent">guarded accounts.</span>
        </h1>
        <p className="text-xl sm:text-2xl lg:text-3xl text-muted max-w-2xl leading-relaxed">
          Passkey authorization at execution time.<br className="hidden sm:block" />
          Hardware to chain. No server.
        </p>
      </div>
    ),
  },

  // 1 — Problem
  {
    id: "problem",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>The Problem</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-7 sm:mb-9">
          Your wallet proves you own the key.<br />
          <span className="italic text-accent">It can&apos;t stop someone who stole it.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-6 sm:mb-8">
          {[
            ["Key is stolen", "A compromised device hands your key to an attacker. The chain sees a valid signature."],
            ["No second check", "There is no confirmation step. The blockchain cannot tell you from your attacker."],
            ["Protocol drained", "Funds move in seconds. The chain did exactly what it was built to do."],
          ].map(([title, body]) => (
            <Card key={title}>
              <p className="font-medium text-ink text-xl mb-2.5">{title}</p>
              <p className="text-muted text-base sm:text-lg leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-accent/30 pl-6 mt-auto">
          <p className="font-serif text-2xl sm:text-3xl text-ink italic leading-snug">
            &ldquo;Crypto has authentication. It does not have authorization.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 2 — Insight
  {
    id: "insight",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>The Insight</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-5">
          February 2025.<br />
          <span className="italic text-accent">The missing piece arrives.</span>
        </h2>
        <p className="text-muted text-xl sm:text-2xl leading-relaxed mb-7 sm:mb-9 max-w-2xl">
          Solana ships SIMD-0075: native P-256 signature verification on every validator.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-8 sm:mb-10">
          {[
            ["Your device already has it", "Touch ID, Face ID, YubiKey, Windows Hello. The private key is generated inside hardware and cannot be extracted by any software."],
            ["Now verifiable onchain", "For the first time, a passkey signature can be verified by the Solana runtime itself. No server. No bridge. Hardware talks directly to the chain."],
          ].map(([title, body]) => (
            <Card key={title}>
              <p className="text-[10px] sm:text-xs font-mono font-semibold text-faint uppercase tracking-[0.2em] mb-3">{title}</p>
              <p className="text-base sm:text-lg text-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-accent/30 pl-6 mt-auto">
          <p className="font-serif text-2xl sm:text-3xl text-ink italic">
            &ldquo;SIMD-0075 shipped in February. We are the first to build production authorization on top of it.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 3 — Solution
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>The Solution</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight mt-2 mb-7 sm:mb-8">
          <span className="italic text-accent">trana</span>
        </h2>
        <div className="border border-border rounded-2xl bg-card p-7 sm:p-10 mb-7 sm:mb-9">
          <p className="text-[10px] sm:text-xs font-mono font-semibold text-faint uppercase tracking-[0.2em] mb-5">The guarantee</p>
          <p className="font-serif text-3xl sm:text-4xl text-ink leading-snug">
            &ldquo;This instruction cannot execute unless your passkey approved it, right now, for exactly this action.&rdquo;
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mt-auto">
          {[
            ["Guard: your programs", "Add one CPI call. Execution is blocked until your passkey approves."],
            ["Authority: zero code", "Transfer your upgrade key to a Trana PDA. The leaked key can no longer deploy."],
            ["Hardware to chain", "Secure Enclave signs. Solana runtime verifies. No server anywhere."],
          ].map(([title, sub]) => (
            <Card key={title}>
              <p className="font-medium text-ink text-xl mb-2">{title}</p>
              <p className="text-muted text-base sm:text-lg leading-relaxed">{sub}</p>
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
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Guard: For Developers</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-5">
          One CPI call.<br />
          <span className="italic text-accent">Any Solana program.</span>
        </h2>
        <p className="text-muted text-xl leading-relaxed mb-7 sm:mb-9">
          3 accounts. 1 CPI call. No new wallet. No infrastructure.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 mt-auto">
          {/* Rust */}
          <div className="bg-card border border-border rounded-2xl p-7 sm:p-9">
            <p className="text-faint text-xs font-mono font-medium uppercase tracking-widest mb-6">In your Solana program</p>
            <div className="font-mono text-sm sm:text-base lg:text-lg leading-relaxed space-y-1">
              <p className="text-faint text-sm sm:text-base">{"// block execution until passkey approves"}</p>
              <p>
                <span className="text-accent">trana</span>
                <span className="text-muted">::cpi::enforce(</span>
              </p>
              <p className="pl-6">
                <span className="text-muted/60">ctx.trana_ctx(),</span>
              </p>
              <p className="pl-6">
                <span className="text-accent">Policy</span>
                <span className="text-muted">::Require,</span>
              </p>
              <p><span className="text-muted">)?;</span></p>
            </div>
          </div>
          {/* TypeScript */}
          <div className="bg-card border border-border rounded-2xl p-7 sm:p-9">
            <p className="text-faint text-xs font-mono font-medium uppercase tracking-widest mb-6">In your frontend</p>
            <div className="font-mono text-sm sm:text-base lg:text-lg leading-relaxed space-y-1">
              <p className="text-faint text-sm sm:text-base">{"// SDK builds the proof transaction"}</p>
              <p>
                <span className="text-accent">await</span>
                <span className="text-muted"> authorizeAndSend({"{"}</span>
              </p>
              <p className="pl-4">
                <span className="text-muted">instruction: </span>
                <span className="text-ink">withdrawIx,</span>
              </p>
              <p className="pl-4">
                <span className="text-muted">label: </span>
                <span className="text-accent/80">&quot;Withdraw 2 SOL&quot;,</span>
              </p>
              <p><span className="text-muted">{"}"});</span></p>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  // 6 — Authority
  {
    id: "authority",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Authority: Zero Code Changes</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-5">
          You don&apos;t touch the program.<br />
          <span className="italic text-accent">You move the key.</span>
        </h2>
        <p className="text-muted text-xl leading-relaxed mb-7 sm:mb-9 max-w-2xl">
          Transfer your upgrade authority to a Trana PDA. From that moment, no one can deploy without a passkey approval. Not even you, without your device.
        </p>
        <div className="bg-card border border-border rounded-2xl p-7 sm:p-9 mb-6 sm:mb-8">
          <p className="text-faint text-xs font-mono font-medium uppercase tracking-widest mb-6">One command. Done.</p>
          <div className="font-mono text-sm sm:text-base lg:text-lg leading-relaxed space-y-1">
            <p className="text-faint text-sm sm:text-base">{"# transfer upgrade authority to a Trana PDA"}</p>
            <p>
              <span className="text-accent">solana program</span>
              <span className="text-muted"> set-upgrade-authority \</span>
            </p>
            <p className="pl-4">
              <span className="text-muted">$PROGRAM \</span>
            </p>
            <p className="pl-4">
              <span className="text-muted">--new-upgrade-authority </span>
              <span className="text-accent">$TRANA_PDA</span>
            </p>
            <p className="mt-4 text-faint text-sm sm:text-base">{"# leaked key cannot deploy. only the PDA can."}</p>
            <p className="text-faint text-sm sm:text-base">{"# and the PDA only signs after passkey proof."}</p>
          </div>
        </div>
        <div className="border-l-2 border-accent/30 pl-6 mt-auto">
          <p className="font-serif text-2xl sm:text-3xl text-ink italic leading-snug">
            &ldquo;The leaked admin key can request. It cannot authorize.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 7 — Policies
  {
    id: "demo",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Policies</Label>
        <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-ink mt-2 mb-4 sm:mb-5">
          The protocol defines<br />
          <span className="italic text-accent">when to ask.</span>
        </h2>
        <p className="text-muted text-base sm:text-lg leading-relaxed mb-5 sm:mb-6 max-w-2xl">
          Policies are declared in the program and stored onchain. Auditable by anyone.
          When a policy fires, execution is blocked until a passkey approves.
        </p>
        <div className="space-y-2 sm:space-y-3 mt-auto">
          {[
            { policy: "::Require",    desc: "Require approval on every execution. No conditions, no exceptions." },
            { policy: "::Limit",      desc: "Require approval when a parameter in the instruction exceeds a threshold." },
            { policy: "::NotBefore",  desc: "Require approval until a specific slot. Governance windows, upgrade delays." },
            { policy: "::NotAfter",   desc: "Require approval after a specific slot. Revocable delegation, time-limited access." },
          ].map(({ policy, desc }) => (
            <div key={policy} className="flex items-center gap-5 sm:gap-8 border border-border bg-card rounded-xl px-5 sm:px-7 py-3.5 sm:py-4">
              <span className="font-mono text-base sm:text-lg font-semibold text-ink shrink-0 min-w-[8rem] sm:min-w-[10rem]">{policy}</span>
              <span className="text-muted text-sm sm:text-base leading-relaxed">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 8 — Where it matters
  {
    id: "where",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Where This Matters</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-7 sm:mb-9">
          Not every transaction.<br />
          <span className="italic text-accent">The ones that count.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mt-auto">
          {[
            ["Protocol upgrades", "A stolen admin key alone cannot deploy malicious code."],
            ["Treasury transfers", "Large disbursements blocked without a device-bound approval."],
            ["Vault withdrawals", "Collateral unlocks require explicit approval."],
            ["Admin actions", "Any irreversible onchain action. Exactly where hacks happen."],
          ].map(([title, body]) => (
            <Card key={title}>
              <p className="font-medium text-ink text-xl mb-2">{title}</p>
              <p className="text-muted text-base sm:text-lg leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Market
  {
    id: "market",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Market</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-7 sm:mb-9">
          Every protocol holding TVL<br />
          <span className="italic">needs this.</span>
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-7 sm:mb-9">
          <div className="border border-border rounded-2xl bg-card p-7 sm:p-10">
            <p className="text-[10px] sm:text-xs font-mono font-semibold text-faint uppercase tracking-[0.2em] mb-3">Solana TVL today</p>
            <p className="font-serif text-6xl sm:text-8xl text-ink leading-none">$7B+</p>
            <p className="text-base sm:text-lg text-muted mt-3">every protocol with TVL is in our market</p>
          </div>
          <div className="border border-border rounded-2xl bg-card p-7 sm:p-10">
            <p className="text-[10px] sm:text-xs font-mono font-semibold text-faint uppercase tracking-[0.2em] mb-3">Total addressable</p>
            <p className="font-serif text-6xl sm:text-8xl text-ink leading-none">$200B</p>
            <p className="text-base sm:text-lg text-muted mt-3">as P-256 verification spreads cross-chain</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-auto">
          {["DeFi protocols", "DAO treasuries", "Protocol admins", "Fintech & custodians"].map(uc => (
            <Card key={uc}>
              <p className="text-base sm:text-lg text-ink"><span className="text-accent mr-1.5">→</span>{uc}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 10 — Business
  {
    id: "business",
    render: () => (
      <div className="flex flex-col h-full px-8 sm:px-20 lg:px-28 pt-10 sm:pt-14 pb-8 overflow-y-auto">
        <Label>Business Model</Label>
        <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink mt-2 mb-7 sm:mb-9">
          Free to integrate.<br />
          <span className="italic text-accent">Own the safety layer.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-6 sm:mb-8">
          {[
            { n: "01", title: "Free primitive",  body: "The programs are open source. Free to integrate. No fee per CPI call. This is a public good." },
            { n: "02", title: "Grants",          body: "Solana Foundation grant funds core development and the security audit. We are already grantees." },
            { n: "03", title: "Enterprise",      body: "Audit certification and SLA for protocols that need guarantees at scale." },
          ].map(({ n, title, body }) => (
            <Card key={n}>
              <p className="text-xs font-mono text-faint mb-4">{n}</p>
              <p className="font-medium text-ink text-xl mb-2">{title}</p>
              <p className="text-muted text-base sm:text-lg leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <div className="border-l-2 border-accent/30 pl-6 mt-auto">
          <p className="font-serif text-2xl sm:text-3xl text-ink italic leading-snug">
            &ldquo;We don&apos;t hold keys. We don&apos;t hold custody. Integrate once, the safety layer is permanently onchain.&rdquo;
          </p>
        </div>
      </div>
    ),
  },

  // 11 — Close / Ask
  {
    id: "close",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 sm:px-24 gap-7 sm:gap-9">
        <h2 className="font-serif text-5xl sm:text-7xl lg:text-8xl leading-[1.05] tracking-tight text-ink">
          Wallets made signing<br />
          <span className="italic">easier.</span>
        </h2>
        <p className="font-serif text-3xl sm:text-4xl lg:text-5xl text-ink italic">
          <span className="not-italic"><TranaWordmark size="1em" /></span>
          {" "}makes execution safer.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 w-full max-w-3xl mt-2">
          {[
            ["Devnet is live",          "Try the vault demo right now. See passkey proof work end to end on real devnet."],
            ["Protocol partners",      "Integrating Guard or Authority? We will help you ship."],
            ["Builders and auditors",  "Building on Solana or want to audit the program? Reach out."],
          ].map(([title, body]) => (
            <Card key={title} className="text-left">
              <p className="font-medium text-ink text-xl mb-2">{title}</p>
              <p className="text-muted text-base sm:text-lg leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
  },

  // 12 — About
  {
    id: "about",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 sm:px-24 gap-5 sm:gap-6">
        <p className="text-[10px] sm:text-xs font-mono font-semibold tracking-[0.24em] uppercase text-faint">
          Built by
        </p>
        <h2 className="font-serif text-6xl sm:text-7xl leading-tight tracking-tight text-ink">
          Efe Behar
        </h2>
        <p className="text-xl sm:text-2xl text-muted leading-relaxed max-w-xl">
          Senior Engineer ·{" "}
          <span className="text-ink font-medium">Colosseum Breakout, Infra track winner</span>
          {" "}with Action Codes · Solana Foundation grantee
        </p>
        <p className="font-serif text-2xl sm:text-3xl text-muted italic">
          Now building the authorization layer Solana was missing.
        </p>
        <p className="font-serif text-4xl sm:text-5xl text-ink italic mt-2">
          Thank you.
        </p>
        <div className="flex gap-10 sm:gap-16 mt-2">
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[10px] font-mono font-semibold tracking-[0.24em] uppercase text-faint">X</p>
            <p className="font-mono text-lg text-ink">beharefe</p>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[10px] font-mono font-semibold tracking-[0.24em] uppercase text-faint">Telegram</p>
            <p className="font-mono text-lg text-ink">beharefe</p>
          </div>
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
    setTimeout(() => { setCurrent(next); setVis(true) }, 120)
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
        className="flex-1 min-h-0 transition-opacity duration-[120ms]"
        style={{ opacity: vis ? 1 : 0 }}
      >
        {slide.render()}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 sm:px-10 py-3 sm:py-4 border-t border-border shrink-0">
        <div className="flex gap-2 items-center">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); go(i) }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === current ? "bg-accent w-5" : "bg-border hover:bg-faint w-1.5"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-4 sm:gap-5">
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            disabled={current === 0}
            className="text-xs font-mono text-faint hover:text-ink disabled:opacity-20 px-2 py-1 transition-colors"
          >
            ←
          </button>
          <span className="text-xs font-mono text-faint tabular-nums">{current + 1} / {total}</span>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            disabled={current === total - 1}
            className="text-xs font-mono text-faint hover:text-ink disabled:opacity-20 px-2 py-1 transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
