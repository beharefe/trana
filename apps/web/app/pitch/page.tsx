"use client"

import { useEffect, useState, useCallback } from "react"

// ── Slide data ────────────────────────────────────────────────────────────────

const SLIDES = [
  // 0 — Hook
  {
    id: "hook",
    tag: null,
    title: (
      <>
        A signature is not<br />enough anymore.
      </>
    ),
    body: (
      <div className="space-y-6 max-w-xl">
        <p className="text-gray-400 text-lg leading-relaxed">
          Every major crypto exploit today uses <span className="text-white font-semibold">valid signatures</span>.
        </p>
        <p className="text-gray-500 leading-relaxed">
          Not bugs. Not broken code.<br />
          Valid transactions — executed exactly as designed.
        </p>
        <div className="pt-2 border-l-2 border-red-500/60 pl-5">
          <p className="text-gray-300 leading-relaxed">
            If a key is compromised,<br />
            <span className="text-white font-semibold">the protocol cannot say no.</span>
          </p>
        </div>
      </div>
    ),
    accent: "red",
  },

  // 1 — Problem
  {
    id: "problem",
    tag: "The Problem",
    title: <>Protocols trust<br />signatures blindly</>,
    body: (
      <div className="grid grid-cols-2 gap-8 max-w-2xl">
        <div className="space-y-3">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">On Solana today</p>
          <ul className="space-y-2 text-sm text-gray-400">
            {[
              "Transaction is signed → executes",
              "No second check",
              "No final approval",
            ].map(t => (
              <li key={t} className="flex items-start gap-2">
                <span className="text-gray-600 mt-0.5">→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">That means</p>
          <ul className="space-y-2 text-sm">
            {[
              ["Admin key compromised", "funds drained"],
              ["Program upgrade pushed", "malicious code"],
              ["Treasury transaction signed", "gone in seconds"],
            ].map(([cause, effect]) => (
              <li key={cause} className="flex items-start gap-2">
                <span className="text-red-500/60 mt-0.5">→</span>
                <span>
                  <span className="text-gray-400">{cause} → </span>
                  <span className="text-red-400">{effect}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-2 mt-2 p-4 rounded-lg border border-red-900/40 bg-red-950/20">
          <p className="text-sm text-gray-300">
            Multisig helps… but it still relies on signatures only.
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            There is no second factor at execution.
          </p>
        </div>
      </div>
    ),
    accent: "red",
  },

  // 2 — Insight
  {
    id: "insight",
    tag: "The Insight",
    title: <>We&apos;re missing a<br />second factor onchain</>,
    body: (
      <div className="max-w-xl space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/40 space-y-2">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Web2 critical actions</p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-300">
              <span>✓ Password</span>
              <span>✓ Second factor</span>
            </div>
          </div>
          <div className="p-4 rounded-lg border border-red-900/40 bg-red-950/20 space-y-2">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Crypto critical actions</p>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-gray-300">✓ Private key</span>
              <span className="text-red-500/70">✗ Nothing else</span>
            </div>
          </div>
        </div>
        <div className="border-l-2 border-indigo-500/60 pl-5 space-y-1">
          <p className="text-gray-500 text-sm">Crypto has authentication.</p>
          <p className="text-white text-xl font-semibold">It doesn&apos;t have authorization.</p>
        </div>
      </div>
    ),
    accent: "indigo",
  },

  // 3 — Solution
  {
    id: "solution",
    tag: "The Solution",
    title: <>Trana Guard</>,
    body: (
      <div className="max-w-xl space-y-6">
        <p className="text-gray-300 text-lg leading-relaxed">
          Trana adds a <span className="text-indigo-400 font-semibold">second factor at execution time</span>.
        </p>
        <div className="p-4 rounded-lg border border-indigo-800/50 bg-indigo-950/20">
          <p className="text-sm text-gray-400 italic">
            &ldquo;This action cannot execute unless a second device approves it.&rdquo;
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">That second factor can be</p>
          <div className="flex gap-3 flex-wrap">
            {["Face ID", "Hardware key", "Secure device"].map(f => (
              <span key={f} className="text-sm px-3 py-1.5 rounded-full border border-indigo-800/50 bg-indigo-950/30 text-indigo-300">
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="border-l-2 border-indigo-500/60 pl-5">
          <p className="text-white font-semibold">
            We are not replacing wallets.<br />
            We are adding a second layer of approval.
          </p>
        </div>
      </div>
    ),
    accent: "indigo",
  },

  // 4 — How it works
  {
    id: "how",
    tag: "How It Works",
    title: <>One line for<br />developers</>,
    body: (
      <div className="max-w-xl space-y-6">
        <div className="rounded-lg border border-gray-700 bg-black/50 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-gray-600 font-mono">vault_program.rs</span>
          </div>
          <pre className="p-4 text-sm font-mono text-indigo-300 leading-relaxed">
{`pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    guard::cpi::enforce(ctx.accounts.into())?;  // ← one line
    transfer_funds(ctx, amount)
}`}
          </pre>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Normal transactions</p>
            <p className="text-gray-400">Work as usual. Zero friction for everyday use.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">High-risk actions</p>
            <p className="text-gray-400">Require second approval. Enforced onchain.</p>
          </div>
        </div>
        <div className="border-l-2 border-indigo-500/60 pl-5">
          <p className="text-white font-semibold">No new wallets. No custody. No friction for everyday use.</p>
        </div>
      </div>
    ),
    accent: "indigo",
  },

  // 5 — Demo
  {
    id: "demo",
    tag: "Live Demo",
    title: <>Compromised key<br />→ blocked</>,
    body: (
      <div className="max-w-xl space-y-6">
        <p className="text-gray-400 leading-relaxed">We simulate a real attack:</p>
        <div className="space-y-2 text-sm">
          {[
            { icon: "→", text: "Attacker obtains the private key", color: "text-gray-500" },
            { icon: "→", text: "Builds a raw withdrawal transaction", color: "text-gray-500" },
            { icon: "→", text: "Submits directly to the chain", color: "text-gray-500" },
          ].map(({ icon, text, color }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-gray-600">{icon}</span>
              <span className={color}>{text}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-red-900/40 bg-red-950/20 space-y-1.5">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Without second factor</p>
            <p className="text-red-400 text-sm font-mono">❌ MissingProof (0x1770)</p>
            <p className="text-xs text-gray-600">Transaction fails onchain</p>
          </div>
          <div className="p-4 rounded-lg border border-green-900/40 bg-green-950/20 space-y-1.5">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">With second factor</p>
            <p className="text-green-400 text-sm font-mono">✅ Confirmed</p>
            <p className="text-xs text-gray-600">Approved by device</p>
          </div>
        </div>
        <div className="border-l-2 border-red-500/60 pl-5">
          <p className="text-white font-semibold">Even with the key, you still can&apos;t execute.</p>
        </div>
      </div>
    ),
    accent: "red",
  },

  // 6 — Use cases
  {
    id: "usecases",
    tag: "Where This Matters",
    title: <>Protecting what<br />actually breaks</>,
    body: (
      <div className="max-w-xl space-y-6">
        <p className="text-gray-400 leading-relaxed">
          This is not for every transaction.<br />
          It&apos;s for the exact places where hacks happen.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Protocol upgrades", icon: "⚙️" },
            { label: "Treasury withdrawals", icon: "🏦" },
            { label: "Admin / authority actions", icon: "🔑" },
            { label: "Vault releases", icon: "🔒" },
            { label: "DAO disbursements", icon: "🗳️" },
            { label: "High-value transfers", icon: "💸" },
          ].map(({ label, icon }) => (
            <div
              key={label}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/30 text-sm"
            >
              <span className="text-lg">{icon}</span>
              <span className="text-gray-300">{label}</span>
            </div>
          ))}
        </div>
        <div className="border-l-2 border-indigo-500/60 pl-5">
          <p className="text-white font-semibold">We protect the most expensive mistakes.</p>
        </div>
      </div>
    ),
    accent: "indigo",
  },

  // 7 — Close
  {
    id: "close",
    tag: null,
    title: <>Execution needs<br />a second factor</>,
    body: (
      <div className="max-w-xl space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/30 space-y-1.5">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Wallets</p>
            <p className="text-gray-300">Made signing easier.</p>
          </div>
          <div className="p-4 rounded-lg border border-indigo-800/50 bg-indigo-950/20 space-y-1.5">
            <p className="text-xs text-indigo-500 uppercase tracking-widest font-semibold">Trana</p>
            <p className="text-white font-medium">Makes execution safer.</p>
          </div>
        </div>
        <div className="pt-4 space-y-2">
          <p className="text-gray-600 text-sm">The missing primitive.</p>
          <p className="text-2xl font-bold text-white leading-snug">
            We&apos;re adding the missing<br />
            <span className="text-indigo-400">second factor</span> to crypto.
          </p>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <a
            href="/"
            className="text-xs px-4 py-2 rounded border border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 transition-colors"
          >
            View live demo →
          </a>
        </div>
      </div>
    ),
    accent: "indigo",
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PitchDeck() {
  const [current, setCurrent] = useState(0)
  const [dir,     setDir]     = useState<1 | -1>(1)
  const [visible, setVisible] = useState(true)

  const total = SLIDES.length

  const go = useCallback((next: number) => {
    if (next < 0 || next >= total) return
    setDir(next > current ? 1 : -1)
    setVisible(false)
    setTimeout(() => {
      setCurrent(next)
      setVisible(true)
    }, 150)
  }, [current, total])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") go(current + 1)
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")                     go(current - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, go])

  const slide = SLIDES[current]

  return (
    <div className="fixed inset-0 bg-[#080810] text-gray-100 font-mono flex flex-col select-none overflow-hidden">

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-900 z-20">
        <div
          className="h-full bg-indigo-500/60 transition-all duration-500"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      {/* ── Brand mark ──────────────────────────────────────────────────────── */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20">
        <span
          className="text-green-400/80 tracking-tight"
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: "1.1rem", fontStyle: "italic", fontWeight: 500, letterSpacing: "-0.02em" }}
        >
          trana
        </span>
      </div>

      {/* ── Slide counter ────────────────────────────────────────────────────── */}
      <div className="absolute top-5 right-6 z-20 flex items-center gap-3">
        <span className="text-xs text-gray-700 font-mono tabular-nums">
          {current + 1} / {total}
        </span>
        <a href="/" className="text-xs text-gray-700 hover:text-gray-500 transition-colors">
          ← demo
        </a>
      </div>

      {/* ── Slide dots ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            className={`rounded-full transition-all duration-200 ${
              i === current
                ? "w-4 h-1.5 bg-indigo-400"
                : "w-1.5 h-1.5 bg-gray-700 hover:bg-gray-500"
            }`}
          />
        ))}
      </div>

      {/* ── Prev / Next arrows ───────────────────────────────────────────────── */}
      <button
        onClick={() => go(current - 1)}
        disabled={current === 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full border border-gray-800 bg-gray-900/60 text-gray-600 hover:text-gray-300 hover:border-gray-700 disabled:opacity-0 transition-all"
      >
        ‹
      </button>
      <button
        onClick={() => go(current + 1)}
        disabled={current === total - 1}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full border border-gray-800 bg-gray-900/60 text-gray-600 hover:text-gray-300 hover:border-gray-700 disabled:opacity-0 transition-all"
      >
        ›
      </button>

      {/* ── Slide content ────────────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center px-16"
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? "translateY(0)" : `translateY(${dir * 12}px)`,
          transition: "opacity 150ms ease, transform 150ms ease",
        }}
      >
        <div className="w-full max-w-3xl space-y-8">

          {/* Tag */}
          {slide.tag && (
            <p className={`text-sm font-semibold uppercase tracking-widest ${
              slide.accent === "red" ? "text-red-500/60" : "text-indigo-500/70"
            }`}>
              {slide.tag}
            </p>
          )}

          {/* Title */}
          <h1 className="text-6xl md:text-7xl font-bold leading-tight tracking-tight text-white">
            {slide.title}
          </h1>

          {/* Body */}
          <div style={{ zoom: 1.5 }}>{slide.body}</div>

        </div>
      </div>

      {/* ── Keyboard hint ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 z-20 text-sm font-semibold text-fuchsia-400">
        ← → to navigate
      </div>

      {/* ── Background grid ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

    </div>
  )
}
