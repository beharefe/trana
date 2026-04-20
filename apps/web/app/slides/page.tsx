"use client"

import { useEffect, useState, useCallback } from "react"

// ── Slide data ────────────────────────────────────────────────────────────────

const SLIDES = [
  // 0 — Title
  {
    id: "title",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-16">
        <div className="mb-6">
          <span className="inline-block text-xs font-bold tracking-[0.3em] uppercase text-indigo-600 border border-indigo-300 rounded px-3 py-1 mb-8">
            Solana · devnet live
          </span>
        </div>
        <h1 className="text-7xl font-black tracking-tight text-gray-900 mb-4">
          Trana<span className="text-indigo-600">Guard</span>
        </h1>
        <p className="text-2xl text-gray-500 font-mono font-normal max-w-2xl leading-relaxed">
          Execution-time passkey enforcement for Solana
        </p>
        <div className="mt-12 flex gap-6 text-sm font-mono text-gray-400">
          <span>No server</span>
          <span className="text-gray-200">·</span>
          <span>No custodian</span>
          <span className="text-gray-200">·</span>
          <span>Pure onchain</span>
        </div>
      </div>
    ),
  },

  // 1 — Problem
  {
    id: "problem",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>The Problem</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-10 leading-tight">
          Every Solana exploit<br />follows the same pattern
        </h2>
        <div className="grid grid-cols-3 gap-6 mb-10">
          {[
            ["1", "Attacker gets the private key"],
            ["2", "Sends raw transactions directly"],
            ["3", "Protocol is drained"],
          ].map(([n, t]) => (
            <div key={n} className="border border-red-200 bg-red-50 rounded-xl p-5">
              <div className="text-3xl font-black text-red-300 mb-2">{n}</div>
              <div className="text-base font-mono text-red-700">{t}</div>
            </div>
          ))}
        </div>
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
          <p className="text-sm font-mono text-gray-500 mb-3 uppercase tracking-widest">Existing "solutions"</p>
          <div className="grid grid-cols-3 gap-4 text-sm font-mono">
            <span className="text-gray-600">UI warnings <span className="text-red-500">→ bypassed with raw tx</span></span>
            <span className="text-gray-600">Multisig <span className="text-red-500">→ high coordination overhead</span></span>
            <span className="text-gray-600">Custodians <span className="text-red-500">→ you're trusting them</span></span>
          </div>
        </div>
      </div>
    ),
  },

  // 2 — Insight
  {
    id: "insight",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>The Insight</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-3 leading-tight">
          February 2025:<br />
          <span className="text-indigo-600">Solana ships SIMD-0075</span>
        </h2>
        <p className="text-xl font-mono text-gray-500 mb-10">
          Native secp256r1 (P-256) signature verification — on every validator.
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-6">
            <p className="text-xs font-mono text-indigo-500 uppercase tracking-widest mb-3">WebAuthn uses P-256</p>
            <p className="text-base font-mono text-gray-700">
              Touch ID, Face ID, YubiKey, Windows Hello — all produce secp256r1 signatures by default.
            </p>
          </div>
          <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-6">
            <p className="text-xs font-mono text-indigo-500 uppercase tracking-widest mb-3">Now verifiable onchain</p>
            <p className="text-base font-mono text-gray-700">
              For the first time: passkeys can be verified natively by the Solana runtime. No server. No bridge.
            </p>
          </div>
        </div>
        <div className="mt-6 border-l-4 border-indigo-500 pl-6">
          <p className="text-xl font-mono text-gray-800">
            "SIMD-0075 is 3 months old. We're the first to build a production-grade authorization primitive on top of it."
          </p>
        </div>
      </div>
    ),
  },

  // 3 — Solution
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>The Solution</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-6 leading-tight">
          One CPI call.<br />
          <span className="text-indigo-600">Execution-time enforcement.</span>
        </h2>
        <div className="border-2 border-indigo-300 bg-indigo-50 rounded-2xl p-8 mb-8">
          <p className="text-xs font-mono text-indigo-500 uppercase tracking-widest mb-3">The guarantee</p>
          <p className="text-2xl font-mono text-gray-800 leading-relaxed">
            "This instruction cannot execute unless the registered passkey signed an intent hash that exactly describes this transaction."
          </p>
        </div>
        <div className="grid grid-cols-3 gap-5 text-sm font-mono">
          {[
            ["⛓", "Enforced by Solana runtime", "Not by a server or UI"],
            ["⚛", "Atomic with execution", "Proof + action together"],
            ["🔑", "Device-bound passkey", "Private key never leaves hardware"],
          ].map(([icon, title, sub]) => (
            <div key={title} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="font-bold text-gray-800 mb-1">{title}</div>
              <div className="text-gray-500">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 4 — How it works
  {
    id: "how",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>How It Works</Tag>
        <h2 className="text-4xl font-black text-gray-900 mt-4 mb-8">Transaction shape</h2>
        <div className="space-y-3 mb-8 font-mono">
          {[
            { ix: "N-2", name: "secp256r1 precompile", note: "Native P-256 sig verify (SIMD-0075)", color: "border-blue-300 bg-blue-50", tag: "bg-blue-100 text-blue-700" },
            { ix: "N-1", name: "guard::record_proof", note: "Carries WebAuthn binding data", color: "border-violet-300 bg-violet-50", tag: "bg-violet-100 text-violet-700" },
            { ix: "N", name: "your_program::action", note: "→ calls guard::cpi::enforce()", color: "border-indigo-400 bg-indigo-50 border-2", tag: "bg-indigo-100 text-indigo-700" },
          ].map(({ ix, name, note, color, tag }) => (
            <div key={ix} className={`flex items-center gap-4 border rounded-xl p-4 ${color}`}>
              <span className={`text-xs font-bold rounded px-2 py-1 shrink-0 ${tag}`}>ix[{ix}]</span>
              <span className="font-bold text-gray-800 text-base flex-1">{name}</span>
              <span className="text-gray-500 text-sm">{note}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm font-mono">
          {[
            ["intent hash", "SHA-256(policy | program | accounts | params | nonce | expiry)"],
            ["nonce", "Consumed on use → replay impossible"],
            ["atomic", "All 3 succeed or all fail — runtime guarantee"],
          ].map(([k, v]) => (
            <div key={k} className="border border-gray-200 bg-gray-50 rounded-xl p-4">
              <div className="text-indigo-600 font-bold mb-1">{k}</div>
              <div className="text-gray-600 text-xs leading-relaxed">{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 5 — Integration
  {
    id: "integration",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>The Integration</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-3">
          3 accounts. 1 call.<br />
          <span className="text-indigo-600">That's everything.</span>
        </h2>
        <p className="text-lg font-mono text-gray-500 mb-8">Copy this into your Anchor program. Ship it.</p>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gray-900 rounded-2xl p-6 font-mono text-sm leading-relaxed">
            <p className="text-gray-500 text-xs mb-3 uppercase tracking-widest">Rust / Anchor</p>
            <p className="text-gray-500">{"// 3 extra accounts"}</p>
            <p><span className="text-blue-400">pub</span> <span className="text-green-400">guard_program</span><span className="text-gray-300">: Program{"<"}Guard{">"},</span></p>
            <p><span className="text-blue-400">pub</span> <span className="text-green-400">trana_registry</span><span className="text-gray-300">: Account{"<"}TwoFactorRegistry{">"},</span></p>
            <p><span className="text-blue-400">pub</span> <span className="text-green-400">trana_instructions</span><span className="text-gray-300">: UncheckedAccount,</span></p>
            <p className="mt-4 text-gray-500">{"// 1 CPI call"}</p>
            <p><span className="text-yellow-400">guard</span><span className="text-gray-300">::cpi::</span><span className="text-indigo-400">enforce</span><span className="text-gray-300">(cpi_ctx)?;</span></p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-6 font-mono text-sm leading-relaxed">
            <p className="text-gray-500 text-xs mb-3 uppercase tracking-widest">TypeScript / SDK</p>
            <p className="text-gray-500">{"// SDK handles everything else"}</p>
            <p><span className="text-blue-400">await</span> <span className="text-yellow-400">authorizeAndSend</span><span className="text-gray-300">{"({"}</span></p>
            <p className="pl-4"><span className="text-green-400">buildIntent</span><span className="text-gray-300">: () ={">"} {"({"}</span></p>
            <p className="pl-8"><span className="text-gray-300">targetProgramId,</span></p>
            <p className="pl-8"><span className="text-gray-300">accounts, params,</span></p>
            <p className="pl-4"><span className="text-gray-300">{"}),"},</span></p>
            <p className="pl-4"><span className="text-green-400">buildTransaction</span><span className="text-gray-300">: ...</span></p>
            <p><span className="text-gray-300">{"}"});</span></p>
          </div>
        </div>
      </div>
    ),
  },

  // 6 — Demo: 3 policies
  {
    id: "demo",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>Live Demo · Localnet</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-8">3 onchain policies. Working now.</h2>
        <div className="space-y-3 mb-8 font-mono">
          {[
            { id: "transfer.large", label: "Large transfer", rule: "≥ 1 SOL withdrawal", color: "border-orange-300 bg-orange-50", badge: "bg-orange-100 text-orange-700" },
            { id: "transfer.rapid_drain", label: "Rapid drain", rule: "Withdrawal within 5 min of ≥ 5 SOL deposit", color: "border-red-300 bg-red-50", badge: "bg-red-100 text-red-700" },
            { id: "transfer.always", label: "Always (opt-in)", rule: "User elected — every withdrawal requires passkey", color: "border-indigo-300 bg-indigo-50", badge: "bg-indigo-100 text-indigo-700" },
          ].map(({ id, label, rule, color, badge }) => (
            <div key={id} className={`flex items-center gap-4 border rounded-xl p-4 ${color}`}>
              <span className={`text-xs font-bold rounded px-2 py-1 shrink-0 ${badge}`}>{id}</span>
              <span className="font-bold text-gray-800 flex-1">{label}</span>
              <span className="text-gray-600 text-sm">{rule}</span>
              <span className="text-lg">🔑</span>
            </div>
          ))}
        </div>
        <div className="border-2 border-red-400 bg-red-50 rounded-2xl p-5 font-mono">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚔</span>
            <div>
              <p className="font-bold text-gray-900">Attack simulation — no proof, raw transaction</p>
              <p className="text-sm text-red-600 mt-0.5">→ <span className="font-bold">MissingProof (0x1770)</span> — immediately, onchain, cannot be bypassed</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  // 7 — Attack proof
  {
    id: "attacks",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>Security</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-8">
          Every attack vector<br />
          <span className="text-indigo-600">has a specific error code.</span>
        </h2>
        <div className="grid grid-cols-3 gap-4 font-mono text-sm mb-8">
          {[
            ["No proof in transaction", "MissingProof", "0x1770"],
            ["Replay old proof", "PayloadMismatch", "nonce consumed"],
            ["Tamper amount after approval", "PayloadMismatch", "params_hash"],
            ["Swap recipient account", "PayloadMismatch", "accounts_hash"],
            ["Wrong passkey device", "WrongSigner", "pubkey check"],
            ["Expired proof (>2 min)", "ProofExpired", "Solana clock"],
          ].map(([attack, error, detail]) => (
            <div key={attack} className="border border-gray-200 bg-white rounded-xl p-4">
              <div className="text-gray-600 text-xs mb-2">{attack}</div>
              <div className="font-bold text-red-600">{error}</div>
              <div className="text-gray-400 text-xs mt-1">{detail}</div>
            </div>
          ))}
        </div>
        <div className="border border-gray-200 bg-gray-50 rounded-xl p-4 font-mono text-sm">
          <span className="text-indigo-600 font-bold">ProofVerified</span>
          <span className="text-gray-500"> event emitted on every success — </span>
          <span className="text-gray-600">policy + program + nonce visible in every tx log. Zero-trust audit trail.</span>
        </div>
      </div>
    ),
  },

  // 8 — Market
  {
    id: "market",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>Market</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-8">Every protocol holding TVL needs this.</h2>
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="border-2 border-indigo-300 bg-indigo-50 rounded-2xl p-6">
            <p className="text-xs font-mono text-indigo-500 uppercase tracking-widest mb-2">Solana TVL</p>
            <p className="text-5xl font-black text-gray-900">$7B+</p>
            <p className="text-sm font-mono text-gray-500 mt-1">every dollar is a potential customer</p>
          </div>
          <div className="border-2 border-gray-200 bg-gray-50 rounded-2xl p-6">
            <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-2">Addressable</p>
            <p className="text-5xl font-black text-gray-900">$200B</p>
            <p className="text-sm font-mono text-gray-500 mt-1">multi-chain as secp256r1 spreads to EVM</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 font-mono text-sm">
          {["DeFi vaults", "DAO treasuries", "Protocol admins", "Fintech / custodians"].map(uc => (
            <div key={uc} className="border border-gray-200 bg-white rounded-xl p-3 text-center">
              <span className="text-indigo-600">→</span>
              <span className="text-gray-700 ml-2">{uc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — Viability
  {
    id: "viability",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>Viability</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-8">
          Open source primitive.<br />
          <span className="text-indigo-600">Own the safety layer.</span>
        </h2>
        <div className="grid grid-cols-3 gap-5 mb-8 font-mono text-sm">
          {[
            { n: "01", title: "Open core", body: "Primitive is free. Managed registry + SLA + key recovery is paid.", color: "border-gray-200" },
            { n: "02", title: "Protocol fee", body: "Micro-fee per guarded transaction. TVL grows → fee grows.", color: "border-indigo-200 bg-indigo-50" },
            { n: "03", title: "SDK licensing", body: "Enterprise support, audited builds, SLA for chains wanting Trana.", color: "border-gray-200" },
          ].map(({ n, title, body, color }) => (
            <div key={n} className={`border rounded-2xl p-5 ${color}`}>
              <div className="text-3xl font-black text-gray-200 mb-2">{n}</div>
              <div className="font-bold text-gray-900 mb-2">{title}</div>
              <div className="text-gray-600 leading-relaxed">{body}</div>
            </div>
          ))}
        </div>
        <div className="border-l-4 border-indigo-500 pl-6 font-mono">
          <p className="text-lg text-gray-700">
            We don't hold custody. We don't hold keys. Protocols integrate once.{" "}
            <span className="font-bold text-gray-900">We own the safety layer they depend on.</span>
          </p>
        </div>
      </div>
    ),
  },

  // 10 — Team
  {
    id: "team",
    render: () => (
      <div className="flex flex-col justify-center h-full px-20">
        <Tag>Team + Why Us</Tag>
        <h2 className="text-5xl font-black text-gray-900 mt-4 mb-8">
          We understand SIMD-0075<br />
          <span className="text-indigo-600">better than anyone building on it.</span>
        </h2>
        <div className="grid grid-cols-2 gap-6 mb-8 font-mono text-sm">
          {[
            ["Built from scratch", "Rust program + TypeScript SDK + React provider — no boilerplate, no shortcuts"],
            ["Working demo tonight", "Not a slide. Not a mock. Live on localnet. Try to break it."],
            ["Open source", "Every line auditable. github.com/beharefe/trana-guard"],
            ["Deep internals", "secp256r1 DER→compact, WebAuthn binding, sysvar indexing — we wrote it all"],
          ].map(([title, body]) => (
            <div key={title} className="border border-gray-200 bg-white rounded-xl p-5">
              <div className="font-bold text-gray-900 mb-1">{title}</div>
              <div className="text-gray-500">{body}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 11 — Ask
  {
    id: "ask",
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center px-20">
        <Tag>The Ask</Tag>
        <h2 className="text-6xl font-black text-gray-900 mt-6 mb-4">
          Ships to mainnet<br />
          <span className="text-indigo-600">in 2 weeks.</span>
        </h2>
        <p className="text-xl font-mono text-gray-500 mb-12 max-w-2xl">
          We built an execution-time authorization layer for Solana.<br />
          Tonight you can try to hack it. You won't.
        </p>
        <div className="grid grid-cols-3 gap-6 w-full max-w-3xl font-mono text-sm mb-12">
          {[
            ["Protocol partners", "DM us tonight. First integrations ship with us."],
            ["Colosseum", "This is our submission. Infrastructure track."],
            ["Ecosystem grants", "Open to Solana Foundation programs."],
          ].map(([title, body]) => (
            <div key={title} className="border border-indigo-200 bg-indigo-50 rounded-xl p-5 text-left">
              <div className="font-bold text-indigo-700 mb-2">{title}</div>
              <div className="text-gray-600">{body}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-8 text-sm font-mono text-gray-400">
          <span>github.com/beharefe/trana-guard</span>
          <span className="text-gray-200">·</span>
          <span>demo live at /slides</span>
        </div>
      </div>
    ),
  },
]

// ── Slide component ───────────────────────────────────────────────────────────

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs font-bold tracking-[0.25em] uppercase text-indigo-600 font-mono">
      {children}
    </span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Slides() {
  const [current, setCurrent] = useState(0)
  const [dir, setDir] = useState<"in" | "out">("in")
  const total = SLIDES.length

  const go = useCallback((next: number) => {
    if (next < 0 || next >= total) return
    setDir("out")
    setTimeout(() => {
      setCurrent(next)
      setDir("in")
    }, 120)
  }, [total])

  const next = useCallback(() => go(current + 1), [current, go])
  const prev = useCallback(() => go(current - 1), [current, go])

  // Keyboard + click
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
      className="w-screen h-screen bg-white font-mono overflow-hidden select-none cursor-pointer flex flex-col"
      onClick={next}
    >
      {/* Slide content */}
      <div
        className="flex-1 transition-all duration-100"
        style={{ opacity: dir === "in" ? 1 : 0, transform: dir === "in" ? "translateY(0)" : "translateY(6px)" }}
      >
        {slide.render()}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-10 py-4 border-t border-gray-100">
        {/* Dot nav */}
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); go(i) }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === current ? "bg-indigo-600 w-4" : "bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>

        {/* Counter */}
        <div className="flex items-center gap-4">
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            disabled={current === 0}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 px-2 py-1"
          >
            ← prev
          </button>
          <span className="text-xs font-mono text-gray-400">
            {current + 1} / {total}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            disabled={current === total - 1}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 px-2 py-1"
          >
            next →
          </button>
        </div>
      </div>
    </div>
  )
}
