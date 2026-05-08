"use client"

import { useState, useEffect, useRef } from "react"
import { SiteNav } from "@/components/SiteNav"

// ── Types ─────────────────────────────────────────────────────────────────────

type Route =
  | "vault/withdraw" | "vault/deposit" | "vault/upgrade"
  | "auth/programs"  | "auth/mints"    | "auth/list"

type AuthKind = "ProgramUpgrade" | "TokenMint" | "TokenFreeze"
type TxResult =
  | { s: "idle" }
  | { s: "pending"; msg: string }
  | { s: "ok";  msg: string; sig?: string }
  | { s: "err"; msg: string; sig?: string }

interface ConsoleLine { ts: string; cls: "eval" | "ok" | "err"; msg: string }

// ── Utilities ─────────────────────────────────────────────────────────────────

function fakeSig() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"
  let s = ""
  for (let i = 0; i < 88; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}
const shortSig = (s: string) => s.slice(0, 4) + "…" + s.slice(-4)
const nowTs = () => {
  const t = new Date()
  return `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}`
}
function fakePda(kind: string, target: string): string | null {
  if (!target || target.length < 8) return null
  const seed = (kind + target).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"
  let s = "", n = seed
  for (let i = 0; i < 44; i++) { s += alpha[n % alpha.length]; n = (n * 1103515245 + 12345) >>> 0 }
  return s.slice(0, 4) + "…" + s.slice(-6)
}
function wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { route: "vault/withdraw" as Route, ix: "01", label: "The vault attack",   group: "demo" },
  { route: "vault/deposit"  as Route, ix: "02", label: "Deposit",            group: "demo" },
  { route: "vault/upgrade"  as Route, ix: "03", label: "Program upgrade",    group: "demo" },
  { route: "auth/programs"  as Route, ix: "04", label: "Secure a program",   group: "auth" },
  { route: "auth/mints"     as Route, ix: "05", label: "Secure a mint",      group: "auth" },
  { route: "auth/list"      as Route, ix: "06", label: "Secured authorities",group: "auth" },
] as const

const AUTH_KIND_CFG: Record<AuthKind, { lbl: string; step2t: string; step2s: string; ph: string }> = {
  ProgramUpgrade: {
    lbl: "Program ID",
    step2t: "Transfer upgrade authority to the PDA",
    step2s: "solana program set-upgrade-authority <target> --new-upgrade-authority <PDA>",
    ph: "paste a program ID — e.g. TRAqCh…wsG",
  },
  TokenMint: {
    lbl: "Mint address",
    step2t: "Transfer mint_authority to the PDA",
    step2s: "spl-token authorize <MINT> mint <PDA>",
    ph: "paste a mint address — e.g. EPjFW…Dt1v",
  },
  TokenFreeze: {
    lbl: "Mint address",
    step2t: "Transfer freeze_authority to the PDA",
    step2s: "spl-token authorize <MINT> freeze <PDA>",
    ph: "paste a mint address — e.g. EPjFW…Dt1v",
  },
}

const VAULT_META: Record<string, { title: string; lede: React.ReactNode }> = {
  "vault/withdraw": {
    title: "The vault attack.",
    lede: (
      <>We give you the <em>seed phrase</em> for the program owner. With it,
      you control the wallet that deployed this vault.{" "}
      <span style={{ color: "var(--plasma)" }}>Drain it.</span> If you can.</>
    ),
  },
  "vault/deposit": {
    title: "Deposit.",
    lede: <>Anyone can deposit into the shared pool. <em>No passkey required.</em> Withdrawals are policy-gated.</>,
  },
  "vault/upgrade": {
    title: "Program upgrade.",
    lede: <>The upgrade authority has been transferred to a Trana Authority PDA. The wallet key alone cannot patch this program.</>,
  },
}

const AUTH_META: Record<string, { title: string; lede: React.ReactNode }> = {
  "auth/programs": {
    title: "Secure a program.",
    lede: (
      <>Transfer your program's <span style={{ color: "var(--bone)" }}>upgrade_authority</span> to a Trana PDA.
      From then on, only a <em>passkey-approved</em> instruction can ship a new binary — even if your deploy key leaks.
      Zero changes to the target program.</>
    ),
  },
  "auth/mints": {
    title: "Secure a mint.",
    lede: (
      <>Move <span style={{ color: "var(--bone)" }}>mint_authority</span> off your wallet and onto a Trana PDA.
      Inflation, treasury draws, supply shocks — every mint now requires a passkey-approved instruction.</>
    ),
  },
  "auth/list": {
    title: "Secured authorities.",
    lede: <>Authorities currently held by Trana PDAs derived from your wallet.</>,
  },
}

// ── Result renderer ───────────────────────────────────────────────────────────

function LastResult({ r }: { r: TxResult }) {
  const base = "flex items-start gap-[10px] border p-[14px] font-mono text-[12.5px]"
  if (r.s === "idle") return (
    <div className={base} style={{ borderColor: "var(--rule)", color: "var(--bone-3)", background: "var(--ink)" }}>
      <ClockIcon /><span>Awaiting attempt</span>
    </div>
  )
  if (r.s === "pending") return (
    <div className={base} style={{ borderColor: "var(--rule)", color: "var(--bone-2)", background: "var(--ink)" }}>
      <ClockIcon /><span>{r.msg}</span>
    </div>
  )
  if (r.s === "ok") return (
    <div className={base} style={{ borderColor: "rgba(198,255,58,0.30)", background: "rgba(198,255,58,0.04)", color: "var(--lime)" }}>
      <CheckIcon />
      <span>{r.msg}{r.sig && <>{" "}
        <a href={`https://solscan.io/tx/${r.sig}?cluster=devnet`} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1 ml-1 font-mono text-[11px]"
           style={{ color: "var(--azure)", borderBottom: "1px dashed rgba(90,169,255,0.35)" }}>
          solscan <span style={{ color: "var(--bone-4)", fontSize: 9, letterSpacing:"0.16em" }}>↗</span>
        </a>
      </>}</span>
    </div>
  )
  return (
    <div className={base} style={{ borderColor: "rgba(255,91,31,0.35)", background: "rgba(255,91,31,0.04)", color: "var(--plasma)" }}>
      <WarnIcon /><span>{r.msg}{r.sig && <> · {shortSig(r.sig)}</>}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TryPage() {
  const [route, setRoute] = useState<Route>("vault/withdraw")
  const [connected, setConnected] = useState(false)
  const [slot, setSlot] = useState(317_409_221)
  const [sideOpen, setSideOpen] = useState(false)

  // vault state
  const [pool, setPool] = useState(12.4)
  const [wAmt, setWAmt] = useState("0.40")
  const [depAmt, setDepAmt] = useState("0.5")
  const [activeChip, setActiveChip] = useState("0.5")
  const [wLast, setWLast] = useState<TxResult>({ s: "idle" })
  const [depLast, setDepLast] = useState<TxResult>({ s: "idle" })
  const [upgLast, setULast] = useState<TxResult>({ s: "idle" })
  const [drainSecs, setDrainSecs] = useState<number | null>(null)
  const [discovered, setDiscovered] = useState<Set<string>>(new Set())

  // auth state
  const [authKind, setAuthKind] = useState<AuthKind>("ProgramUpgrade")
  const [authTarget, setAuthTarget] = useState("")
  const [authBusy, setAuthBusy] = useState(false)
  const [authStatus, setAuthStatus] = useState<string | null>(null)
  const [amTxsig, setAmTxsig] = useState<string | null>(null)
  const [step2Done, setStep2Done] = useState(false)
  const [step3Done, setStep3Done] = useState(false)
  const [lines, setLines] = useState<ConsoleLine[]>([
    { ts: nowTs(), cls: "eval", msg: "$ trana auth secure --kind program-upgrade" },
    { ts: nowTs(), cls: "eval", msg: "awaiting target program ID…" },
  ])
  const consoleRef = useRef<HTMLDivElement>(null)

  // slot ticker
  useEffect(() => {
    const id = setInterval(() => setSlot(s => s + Math.floor(2 + Math.random() * 3)), 480)
    return () => clearInterval(id)
  }, [])

  // drain countdown
  useEffect(() => {
    if (drainSecs === null || drainSecs <= 0) { if (drainSecs === 0) setDrainSecs(null); return }
    const id = setTimeout(() => setDrainSecs(s => s !== null ? s - 1 : null), 1000)
    return () => clearTimeout(id)
  }, [drainSecs])

  // console auto-scroll
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [lines])

  function addLine(cls: ConsoleLine["cls"], msg: string) {
    setLines(prev => [...prev, { ts: nowTs(), cls, msg }])
  }

  const wSliderVal = Math.max(0.01, Math.min(5, parseFloat(wAmt) || 0))
  const wFillPct   = ((wSliderVal - 0.01) / 4.99) * 100
  const wOver      = wSliderVal >= 1

  function handleWithdraw() {
    const v = parseFloat(wAmt)
    if (isNaN(v) || v <= 0) return
    if (v >= 1) {
      setWLast({ s: "err", msg: `Reverted · policy::Limit · passkey required for ≥ 1 SOL`, sig: fakeSig() })
      setDiscovered(prev => new Set([...prev, "B"]))
      return
    }
    if (drainSecs !== null) {
      setWLast({ s: "pending", msg: "Awaiting passkey…" })
      setDiscovered(prev => new Set([...prev, "C"]))
      setTimeout(() => {
        const sig = fakeSig()
        setPool(p => Math.max(0, p - v))
        setWLast({ s: "ok", msg: `Withdrawn ${v.toFixed(2)} SOL · proof verified`, sig })
        setDiscovered(prev => new Set([...prev, "D"]))
      }, 1600)
      return
    }
    const sig = fakeSig()
    setPool(p => Math.max(0, p - v))
    setWLast({ s: "ok", msg: `Withdrawn ${v.toFixed(2)} SOL · wallet sign only`, sig })
    setDiscovered(prev => new Set([...prev, "A"]))
    setDrainSecs(60)
  }

  function handleDeposit() {
    const v = parseFloat(depAmt)
    if (isNaN(v) || v <= 0) return
    const sig = fakeSig()
    setPool(p => p + v)
    setDepLast({ s: "ok", msg: `Deposited ${v.toFixed(2)} SOL · pool now ${(pool + v).toFixed(2)} SOL`, sig })
  }

  async function handleAuthSecure() {
    if (!connected) setConnected(true)
    if (authTarget.length < 6) { addLine("err", "no target supplied"); return }
    const pda = fakePda(authKind, authTarget) ?? "—"
    const cfg = AUTH_KIND_CFG[authKind]
    setAuthBusy(true); setAuthStatus("submitting…")

    addLine("eval", `$ trana auth secure --kind ${authKind.toLowerCase()} --target ${authTarget}`)
    await wait(400); addLine("eval", `derived PDA: ${pda}`)
    await wait(400); addLine("eval", "ix[0] secp256r1::verify P-256")
    await wait(350); addLine("eval", "ix[1] trana_guard::record_proof → sysvar")
    await wait(350); addLine("eval", "ix[2] trana_authority::register")
    await wait(350); addLine("eval", authKind === "ProgramUpgrade" ? "ix[3] bpf_loader::set_upgrade_authority" : "ix[3] spl_token::set_authority")
    await wait(500)
    addLine("ok", "PROOF · VERIFIED ✓")
    addLine("ok", "AuthorityRecord PDA initialized")
    addLine("ok", `${authKind === "ProgramUpgrade" ? "upgrade_authority" : "mint_authority"} → ${pda}`)

    setStep2Done(true); setStep3Done(true)
    setAuthStatus("confirmed")
    setAmTxsig("5Fv" + Math.random().toString(36).slice(2, 8) + "…M6s")
    setAuthBusy(false)
  }

  const kindCfg  = AUTH_KIND_CFG[authKind]
  const pda      = fakePda(authKind, authTarget)
  const isVault  = route.startsWith("vault/")
  const vTab     = isVault ? (route.split("/")[1] as "withdraw" | "deposit" | "upgrade") : null
  const crumbA   = isVault ? "vault" : "authority"
  const crumbB   = route.split("/")[1]
  const vMeta    = VAULT_META[route]
  const aMeta    = AUTH_META[route]

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <SiteNav />

      <div className="try-app">

        {/* ══ Sidebar ══ */}
        <aside
          className="try-sidebar border-r flex flex-col gap-[18px] py-[22px] px-[18px]"
          style={{ borderColor: "var(--rule)", background: "var(--ink-2)" }}
        >
          {/* Devnet pill */}
          <span
            className="inline-flex items-center gap-2 self-start px-[10px] py-[6px] font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ border: "1px solid rgba(255,91,31,0.40)", color: "var(--plasma)" }}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--plasma)" }} />
            Devnet
          </span>

          {/* Mobile toggle */}
          <button
            className="flex md:hidden items-center gap-2 self-start px-[10px] py-2 font-mono text-[11px] tracking-[0.18em] uppercase cursor-pointer"
            style={{ border: "1px solid var(--rule-2)", color: "var(--bone-2)", background: "transparent" }}
            onClick={() => setSideOpen(o => !o)}
          >
            Menu
          </button>

          {/* Nav */}
          <div className={`flex-col gap-[2px] ${sideOpen ? "flex" : "hidden md:flex"}`}>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase px-[10px] pt-[10px] pb-[6px]" style={{ color: "var(--bone-4)" }}>
              Try the demo
            </div>
            {NAV_ITEMS.filter(n => n.group === "demo").map(n => (
              <NavItem key={n.route} item={n} active={route === n.route}
                onClick={() => { setRoute(n.route); setSideOpen(false) }} />
            ))}

            <div className="font-mono text-[10px] tracking-[0.2em] uppercase px-[10px] pt-[14px] pb-[6px]" style={{ color: "var(--bone-4)" }}>
              Manage authorities
            </div>
            {NAV_ITEMS.filter(n => n.group === "auth").map(n => (
              <NavItem key={n.route} item={n} active={route === n.route} auth
                onClick={() => { setRoute(n.route); setSideOpen(false) }} />
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="mt-auto flex justify-between items-center pt-3 border-t font-mono text-[11px]"
               style={{ borderColor: "var(--rule)", color: "var(--bone-4)" }}>
            <a href="/" style={{ color: "var(--bone-4)" }} className="hover:text-bone-2 transition-colors">← back</a>
            <span>v0.4.2 · devnet</span>
          </div>
        </aside>

        {/* ══ Main ══ */}
        <div style={{ minWidth: 0 }}>

          {/* Topbar */}
          <div
            className="sticky top-[60px] z-10 flex items-center gap-3 flex-wrap px-6 sm:px-8 py-[14px] border-b"
            style={{ borderColor: "var(--rule)", background: "rgba(10,10,11,0.82)", backdropFilter: "blur(8px)" }}
          >
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 font-mono text-[11.5px] tracking-[0.04em] flex-1 min-w-0" style={{ color: "var(--bone-3)" }}>
              <span>devnet</span>
              <span style={{ color: "var(--bone-4)" }}>/</span>
              <span>{crumbA}</span>
              <span style={{ color: "var(--bone-4)" }}>/</span>
              <span style={{ color: "var(--bone)" }}>{crumbB}</span>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em] cursor-pointer"
                style={{ border: "1px solid var(--rule-2)", color: "var(--bone-2)", background: "transparent" }}
                onClick={() => alert("seed: cliff donor sword fortune embark crowd ramp insect dish enrich gauge tuition\n\n— demo seed bound to the devnet vault. drain it if you can.")}
              >
                <KeyIcon />
                <span className="hidden sm:inline">Seed phrase</span>
              </button>
              <a
                href="https://faucet.solana.com" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em]"
                style={{ border: "1px solid var(--rule-2)", color: "var(--bone-2)" }}
              >
                <span className="hidden sm:inline">Get devnet SOL</span>
                <span>↗</span>
              </a>
              <button
                className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em] cursor-pointer"
                style={{
                  border: connected ? "1px solid rgba(198,255,58,0.35)" : "1px solid var(--rule-2)",
                  background: connected ? "rgba(198,255,58,0.06)" : "transparent",
                  color: connected ? "var(--lime)" : "var(--bone-2)",
                }}
                onClick={() => setConnected(true)}
              >
                <WalletIcon />
                <span>{connected ? "HxRyP…7Cmf" : "Connect"}</span>
              </button>
            </div>
          </div>

          {/* Page content */}
          <div className="px-5 sm:px-8 pt-9 pb-16" style={{ maxWidth: 1180 }}>

            {/* ── Vault routes ── */}
            {isVault && vMeta && (
              <>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: "var(--bone-3)" }}>
                  § The leaked-key demo
                </div>
                <h1 className="font-serif font-normal leading-[0.98] tracking-[-0.02em] mb-[14px]"
                    style={{ fontSize: "clamp(38px,5vw,64px)", color: "var(--bone)" }}>
                  {vMeta.title}
                </h1>
                <p className="text-[15px] leading-[1.6] font-light mb-7 max-w-[64ch]" style={{ color: "var(--bone-2)" }}>
                  {vMeta.lede}
                </p>

                {/* Tab cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-[14px] mb-7">
                  {[
                    { tab: "deposit",  icon: <DepositIcon />, name: "Deposit",         sub: "Top up the shared pool",     tag: "no passkey required",      tagCls: "" },
                    { tab: "withdraw", icon: <WithdrawIcon />, name: "Withdraw",       sub: "Try to drain the pool",      tag: "3 policies — discover them", tagCls: "lime" },
                    { tab: "upgrade",  icon: <UpgradeIcon />, name: "Program upgrade", sub: "Try to patch the program",   tag: "Authority PDA primitive",    tagCls: "plasma" },
                  ].map(({ tab, icon, name, sub, tag, tagCls }) => (
                    <button
                      key={tab}
                      onClick={() => setRoute((`vault/${tab}`) as Route)}
                      className="text-left flex flex-col gap-2 p-[18px] border transition-colors cursor-pointer"
                      style={{
                        borderColor: vTab === tab ? "rgba(198,255,58,0.45)" : "var(--rule-2)",
                        background: vTab === tab ? "rgba(198,255,58,0.04)" : "var(--ink-2)",
                      }}
                    >
                      <span style={{ color: vTab === tab ? "var(--lime)" : "var(--bone-3)" }}>{icon}</span>
                      <span className="font-mono text-[14px]" style={{ color: "var(--bone)" }}>{name}</span>
                      <span className="font-mono text-[12px]" style={{ color: "var(--bone-3)" }}>{sub}</span>
                      <span
                        className="inline-flex items-center gap-[6px] mt-[6px] px-[9px] py-[5px] w-fit font-mono font-medium text-[10px] tracking-[0.16em] uppercase"
                        style={{
                          border: tagCls === "lime" ? "1px solid rgba(198,255,58,0.30)" : tagCls === "plasma" ? "1px solid rgba(255,91,31,0.30)" : "1px solid var(--rule-2)",
                          color: tagCls === "lime" ? "var(--lime)" : tagCls === "plasma" ? "var(--plasma)" : "var(--bone-3)",
                        }}
                      >
                        {tag}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Withdraw panel */}
                {vTab === "withdraw" && (
                  <Panel
                    dot="lime"
                    title="Withdraw"
                    subtitle="attempt to drain"
                    policyLabel={wOver ? "Limit (threshold exceeded)" : "Limit (under threshold)"}
                    policyColor={wOver ? "var(--plasma)" : "var(--lime)"}
                  >
                    <PanelBody>
                      <Label>Amount &middot; <span style={{ color: "var(--bone-2)", textTransform: "none", letterSpacing: 0 }}>0.01 — 5 SOL</span></Label>
                      <AmountInput value={wAmt} onChange={v => setWAmt(v)} unit="SOL" />

                      {/* Slider */}
                      <div className="mt-3 relative pt-[14px] pb-[6px]">
                        <input
                          type="range" min="0.01" max="5" step="0.01"
                          value={wSliderVal}
                          onChange={e => { setWAmt(Number(e.target.value).toFixed(2)) }}
                          className={`try-slider${wOver ? " over" : ""}`}
                          style={{
                            background: `linear-gradient(to right,
                              var(--lime) 0%,
                              var(--lime) 20.2%,
                              rgba(255,91,31,0.32) 20.2%,
                              rgba(255,91,31,0.32) ${wFillPct}%,
                              var(--rule-2) ${wFillPct}%,
                              var(--rule-2) 100%)`,
                          }}
                        />
                        {/* Limit marker */}
                        <div className="absolute pointer-events-none" style={{ left: "20.2%", top: 0, bottom: 6, width: 1, background: "var(--plasma)" }}>
                          <span className="absolute left-[6px] top-0 font-mono text-[9.5px] tracking-[0.2em] uppercase whitespace-nowrap" style={{ color: "var(--plasma)" }}>
                            LIMIT · 1 SOL
                          </span>
                          <span className="absolute w-[5px] h-[5px] rounded-full" style={{ background: "var(--plasma)", bottom: 4, left: -2 }} />
                        </div>
                      </div>
                      <div className="flex justify-between font-mono text-[11px] mb-4" style={{ color: "var(--bone-3)" }}>
                        <span>0.01</span>
                        <span style={{ color: "var(--lime)" }}>↑ 1.00 limit</span>
                        <span>5.00</span>
                      </div>

                      <ActionBtn over={wOver} onClick={handleWithdraw}>
                        {wOver ? "Approve & Withdraw ⚿" : "Withdraw →"}
                      </ActionBtn>
                      <div className="mt-3 font-mono text-[11.5px]" style={{ color: "var(--bone-3)" }}>
                        Pool balance · <span style={{ color: "var(--bone)" }}>{pool.toFixed(2)}</span> SOL. Try a small amount first.
                      </div>
                    </PanelBody>

                    <PanelAside>
                      {/* Drain window */}
                      <Label>Drain window</Label>
                      <div
                        className="flex items-center gap-[10px] border p-[14px] font-mono text-[12.5px] mb-4"
                        style={{
                          borderColor: drainSecs !== null ? "rgba(198,255,58,0.30)" : "var(--rule)",
                          background: drainSecs !== null ? "rgba(198,255,58,0.04)" : "var(--ink)",
                          color: drainSecs !== null ? "var(--lime)" : "var(--bone-3)",
                        }}
                      >
                        <ClockIcon />
                        {drainSecs !== null
                          ? <span><span style={{ color: "var(--bone)" }}>Open</span> · closes in {drainSecs}s</span>
                          : <span><span style={{ color: "var(--bone)" }}>Closed</span> · <span style={{ color: "var(--bone-3)" }}>60s window opens after a withdrawal</span></span>
                        }
                      </div>

                      <Label>Last result</Label>
                      <LastResult r={wLast} />

                      {/* Discovered states */}
                      <div className="mt-5">
                        <Label>Discovered states</Label>
                        <div className="flex flex-col gap-[10px] mt-2">
                          {[
                            { id: "A", title: "Small + no window", sub: "< 1 SOL · wallet sign only" },
                            { id: "B", title: "Large amount",      sub: "≥ 1 SOL · passkey required" },
                            { id: "C", title: "Rapid consecutive", sub: "Window open · passkey required" },
                            { id: "D", title: "Passkey approved",  sub: "Proof verified · executed" },
                          ].map(st => (
                            <div
                              key={st.id}
                              className="grid gap-[10px] items-start p-[10px] border"
                              style={{
                                gridTemplateColumns: "22px 1fr",
                                borderColor: discovered.has(st.id) ? "rgba(198,255,58,0.30)" : "var(--rule)",
                                background: discovered.has(st.id) ? "rgba(198,255,58,0.04)" : "var(--ink)",
                              }}
                            >
                              <span className="font-mono font-medium text-[10.5px] tracking-[0.12em]"
                                    style={{ color: discovered.has(st.id) ? "var(--lime)" : "var(--bone-3)" }}>
                                {st.id}
                              </span>
                              <div>
                                <div className="font-mono text-[12.5px] mb-[2px]"
                                     style={{ color: discovered.has(st.id) ? "var(--lime)" : "var(--bone)" }}>
                                  {st.title}
                                </div>
                                <div className="font-mono text-[11.5px]" style={{ color: "var(--bone-3)" }}>{st.sub}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PanelAside>
                  </Panel>
                )}

                {/* Deposit panel */}
                {vTab === "deposit" && (
                  <Panel dot="lime" title="Deposit" subtitle="add to the pool" policyLabel="None" policyColor="var(--bone-3)">
                    <PanelBody>
                      <Label>Amount</Label>
                      <AmountInput value={depAmt} onChange={v => setDepAmt(v)} unit="SOL" />
                      <div className="grid grid-cols-4 gap-2 mt-[10px]">
                        {["0.1", "0.5", "1", "2"].map(c => (
                          <button
                            key={c} onClick={() => { setActiveChip(c); setDepAmt(c) }}
                            className="py-[9px] text-center font-mono text-[13px] border cursor-pointer"
                            style={{
                              borderColor: activeChip === c ? "rgba(198,255,58,0.40)" : "var(--rule-2)",
                              background: activeChip === c ? "rgba(198,255,58,0.05)" : "transparent",
                              color: activeChip === c ? "var(--lime)" : "var(--bone-2)",
                            }}
                          >{c}</button>
                        ))}
                      </div>
                      <ActionBtn over={false} onClick={handleDeposit}>Deposit →</ActionBtn>
                      <div className="mt-3 font-mono text-[11.5px]" style={{ color: "var(--bone-3)" }}>
                        Anyone can deposit. No passkey required.
                      </div>
                    </PanelBody>
                    <PanelAside>
                      <Label>Last result</Label>
                      <div style={{ marginBottom: 16 }}>
                        {depLast.s === "idle"
                          ? <div className="flex items-center gap-[10px] border p-[14px] font-mono text-[12.5px]"
                                 style={{ borderColor: "var(--rule)", color: "var(--bone-3)", background: "var(--ink)" }}>
                              <ClockIcon /><span>Awaiting deposit</span>
                            </div>
                          : <LastResult r={depLast} />
                        }
                      </div>
                      <div className="font-mono text-[12.5px] leading-[1.7]" style={{ color: "var(--bone-2)" }}>
                        The vault is a shared pool. Deposits open the door <em style={{ color: "var(--bone)" }}>in</em>;
                        only <span style={{ color: "var(--lime)" }}>withdrawals</span> are policy-gated.
                      </div>
                      <MetaRow k="Pool balance" v={`${pool.toFixed(1)} SOL`} />
                      <MetaRow k="Total deposits" v="847" />
                      <MetaRow k="Vault PDA" v="8Qf…a3L" />
                    </PanelAside>
                  </Panel>
                )}

                {/* Upgrade panel */}
                {vTab === "upgrade" && (
                  <Panel
                    dot="plasma"
                    title="Program upgrade"
                    subtitle="authority PDA"
                    policyLabel="Require"
                    policyColor="var(--plasma)"
                  >
                    <PanelBody>
                      <Label>Upgrade authority</Label>
                      <div className="border p-[14px] flex flex-col gap-1 mb-4" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
                        <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-3)" }}>trana_authority PDA</span>
                        <span className="font-mono text-[16px]" style={{ color: "var(--bone)" }}>KoXv…vGEE</span>
                      </div>
                      <button
                        className="w-full py-4 px-6 font-mono font-semibold text-[13px] tracking-[0.18em] uppercase border cursor-pointer mb-3 transition-colors"
                        style={{ background: "transparent", color: "var(--plasma)", border: "1px solid rgba(255,91,31,0.45)" }}
                        onClick={() => setULast({ s: "err", msg: "Reverted · BPF Loader · upgrade authority mismatch" })}
                      >
                        Upgrade with leaked wallet key
                      </button>
                      <button
                        className="w-full py-4 px-6 font-mono font-semibold text-[13px] tracking-[0.18em] uppercase cursor-pointer transition-colors"
                        style={{ background: "var(--lime)", color: "var(--ink)" }}
                        onClick={() => {
                          setULast({ s: "pending", msg: "Awaiting passkey…" })
                          setTimeout(() => setULast({ s: "ok", msg: "UpgradeExecuted · trana_authority::execute_upgrade", sig: fakeSig() }), 1400)
                        }}
                      >
                        Upgrade with passkey
                      </button>
                      <div className="mt-[14px] font-mono text-[12px] leading-[1.7]" style={{ color: "var(--bone-3)" }}>
                        The wallet key alone cannot upgrade this program. The upgrade authority has been transferred to the Trana Authority PDA.
                      </div>
                    </PanelBody>
                    <PanelAside>
                      <Label>Last result</Label>
                      <LastResult r={upgLast} />
                      <div className="mt-5 flex flex-col gap-[10px]">
                        <Label>What this proves</Label>
                        <CheckRow ok={false} title="Wallet key alone" sub="BPF Loader rejects — not the authority" />
                        <CheckRow ok={true} title="Passkey approved" sub="execute_upgrade CPI succeeds" />
                      </div>
                      <MetaRow k="Program ID" v="TRAqCh…wsG" color="var(--bone)" />
                      <MetaRow k="Upgrade auth" v="TRNA8i…G4AN" color="var(--plasma)" />
                      <MetaRow k="Program state" v="● live" color="var(--lime)" />
                    </PanelAside>
                  </Panel>
                )}
              </>
            )}

            {/* ── Auth routes ── */}
            {!isVault && aMeta && (
              <>
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: "var(--plasma)" }}>
                  § trana_authority · devnet
                </div>
                <h1 className="font-serif font-normal leading-[0.98] tracking-[-0.02em] mb-[14px]"
                    style={{ fontSize: "clamp(38px,5vw,64px)", color: "var(--bone)" }}>
                  {aMeta.title}
                </h1>
                <p className="text-[15px] leading-[1.6] font-light mb-7 max-w-[64ch]" style={{ color: "var(--bone-2)" }}>
                  {aMeta.lede}
                </p>

                {/* Auth form view */}
                {route !== "auth/list" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-[18px] items-start">

                    {/* Left: form card */}
                    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                      <div className="flex items-center justify-between px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)", color: "var(--bone-2)" }}>
                        <div className="flex items-center gap-[10px]">
                          <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-4)" }}>step 01 — 03</span>
                          <span className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Register &amp; transfer</span>
                        </div>
                        <span className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>
                          network: <span style={{ color: "var(--plasma)" }}>devnet</span>
                        </span>
                      </div>
                      <div className="p-6">
                        {/* Kind segmented control */}
                        <div className="grid grid-cols-3 border mb-5" style={{ border: "1px solid var(--rule-2)", background: "var(--ink)" }}>
                          {(["ProgramUpgrade", "TokenMint", "TokenFreeze"] as AuthKind[]).map((k, i) => (
                            <button
                              key={k}
                              onClick={() => setAuthKind(k)}
                              className="py-3 px-2 font-mono font-medium text-[11px] tracking-[0.18em] uppercase cursor-pointer"
                              style={{
                                background: authKind === k ? "rgba(255,91,31,0.06)" : "transparent",
                                color: authKind === k ? "var(--plasma)" : "var(--bone-3)",
                                borderRight: i < 2 ? "1px solid var(--rule-2)" : "none",
                                border: i < 2 ? "0 0 0 0" : "none",
                                borderRightWidth: i < 2 ? 1 : 0,
                                borderRightStyle: "solid",
                                borderRightColor: "var(--rule-2)",
                                borderTop: "none", borderLeft: "none", borderBottom: "none",
                              }}
                            >
                              {k === "ProgramUpgrade" ? "Program" : k === "TokenMint" ? "Token mint" : "Token freeze"}
                            </button>
                          ))}
                        </div>

                        <Label>{kindCfg.lbl}</Label>
                        <div className="flex items-center gap-2 border px-4 py-3 mb-5" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
                          <input
                            type="text"
                            value={authTarget}
                            onChange={e => setAuthTarget(e.target.value)}
                            placeholder={kindCfg.ph}
                            className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[14px]"
                            style={{ color: "var(--bone)", caretColor: "var(--lime)" }}
                          />
                        </div>

                        {/* PDA derivation readout */}
                        <div className="grid gap-[10px_18px] border p-[14px] mb-5 font-mono text-[12.5px]"
                             style={{ gridTemplateColumns: "130px 1fr", borderColor: "var(--rule)", background: "var(--ink)" }}>
                          {[
                            ["Owner", connected ? "HxRyP9LzVQa…2Tg7Cmf" : "connect wallet to derive", !connected],
                            ["Authority kind", authKind, false],
                            ["Derived PDA", pda ?? "— enter target —", !pda],
                            ["Seeds", '[ "trana-authority", owner, target ]', true],
                          ].map(([k, v, dim]) => (
                            <>
                              <span key={k + "k"} className="font-mono text-[10.5px] tracking-[0.18em] uppercase pt-[2px]" style={{ color: "var(--bone-3)" }}>{k as string}</span>
                              <span key={k + "v"} className="font-mono break-all text-[12px]" style={{ color: dim ? "var(--bone-3)" : "var(--bone)", fontSize: k === "Seeds" ? 11.5 : undefined }}>{v as string}</span>
                            </>
                          ))}
                        </div>

                        {/* Steps */}
                        <ul className="flex flex-col mb-5">
                          <StepRow n={1} done title="Register the AuthorityRecord PDA" sub="trana_authority::register(kind) · on-chain" />
                          <StepRow n={2} done={step2Done} cur={!step2Done} title={kindCfg.step2t} sub={kindCfg.step2s} />
                          <StepRow n={3} done={step3Done} title="Verify on-chain" sub="solana program show — confirms the PDA is the new authority" />
                        </ul>

                        <button
                          onClick={handleAuthSecure}
                          disabled={authBusy}
                          className="w-full py-4 px-6 font-mono font-semibold text-[13px] tracking-[0.18em] uppercase cursor-pointer transition-colors disabled:opacity-50"
                          style={{ background: "var(--plasma)", color: "var(--ink)", border: "none" }}
                        >
                          {authBusy ? "Securing…" : "Secure this authority →"}
                        </button>

                        {/* Danger note */}
                        <div className="grid gap-3 items-start mt-5 p-[14px] border font-mono text-[12.5px]"
                             style={{ gridTemplateColumns: "22px 1fr", borderColor: "rgba(255,91,31,0.30)", background: "rgba(255,91,31,0.04)", color: "var(--bone-2)" }}>
                          <WarnIcon />
                          <div>
                            <span style={{ color: "var(--plasma)", fontWeight: 600 }}>Devnet only.</span>
                            <span className="block mt-1 text-[11.5px]" style={{ color: "var(--bone-3)" }}>
                              This tool is wired to devnet. For mainnet, run the same flow from the Trana CLI — we won't touch real authorities through a webpage.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: receipt + console */}
                    <div className="flex flex-col gap-[18px]" style={{ minWidth: 0 }}>

                      {/* Receipt card */}
                      <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                        <div className="flex items-center justify-between px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)" }}>
                          <div className="flex items-center gap-[10px]">
                            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-4)" }}>live</span>
                            <span className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Transaction receipt</span>
                          </div>
                          <span className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>
                            slot <span style={{ color: "var(--bone)" }}>{slot.toLocaleString("en-US")}</span>
                          </span>
                        </div>
                        <div className="px-6 py-4">
                          {[
                            { k: "ix[0]", v: "Secp256r1SigVerify", c: "var(--bone-2)" },
                            { k: "ix[1]", v: "trana_guard::record_proof", c: "var(--bone-2)" },
                            { k: "ix[2]", v: "trana_authority::register", c: "var(--lime)" },
                            { k: "ix[3]", v: authKind === "ProgramUpgrade" ? "bpf_loader::set_upgrade_authority" : "spl_token::set_authority", c: "var(--plasma)" },
                            { k: "Status", v: authStatus ?? "awaiting submit", c: authStatus === "confirmed" ? "var(--lime)" : authStatus === "submitting…" ? "var(--bone-2)" : "var(--bone-3)" },
                            { k: "Tx sig", v: amTxsig ?? "—", c: amTxsig ? "var(--bone)" : "var(--bone-3)" },
                          ].map(row => (
                            <MetaRow key={row.k} k={row.k} v={row.v} color={row.c} />
                          ))}
                        </div>
                      </div>

                      {/* Console */}
                      <div className="border flex flex-col" style={{ borderColor: "var(--rule)", background: "var(--ink)", height: 280 }}>
                        <div className="flex items-center justify-between px-4 py-[10px] border-b font-mono text-[10.5px] tracking-[0.18em] uppercase shrink-0"
                             style={{ borderColor: "var(--rule)", color: "var(--bone-3)" }}>
                          <span>console · trana_authority</span>
                          <span>{nowTs()} UTC</span>
                        </div>
                        <div ref={consoleRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]"
                             style={{ color: "var(--bone-2)" }}>
                          {lines.map((ln, i) => (
                            <div key={i} className="flex gap-3">
                              <span className="shrink-0 w-16" style={{ color: "var(--bone-4)" }}>{ln.ts}</span>
                              <span style={{ color: ln.cls === "ok" ? "var(--lime)" : ln.cls === "err" ? "var(--plasma)" : "var(--bone-2)" }}>
                                {ln.msg}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auth list view */}
                {route === "auth/list" && (
                  <div className="border" style={{ borderColor: "var(--rule)", background: "var(--ink-2)" }}>
                    <div className="grid font-mono font-medium text-[10.5px] tracking-[0.18em] uppercase px-[18px] py-[14px] border-b"
                         style={{ gridTemplateColumns: "1fr 110px 90px", borderColor: "var(--rule)", color: "var(--bone-3)" }}>
                      <span>Target</span><span>Authority</span><span>Status</span>
                    </div>
                    {[
                      { pid: "TRAqCh9KrLpZ7zVkPwsG", name: "demo program · v0.1.2", kind: "upgrade" },
                      { pid: "MNtUsdC7VnPq8wJk2sLxF", name: "USDC fork · stable mint", kind: "mint" },
                      { pid: "FZxq8RkwZpL3vNcM6YuTd", name: "governance vote", kind: "freeze" },
                    ].map((row, i) => (
                      <div key={i} className="grid items-center px-[18px] py-[14px] border-b font-mono text-[12.5px]"
                           style={{ gridTemplateColumns: "1fr 110px 90px", borderColor: "var(--rule)", color: "var(--bone)" }}>
                        <span>
                          <span className="truncate block">{row.pid}</span>
                          <span className="block text-[10.5px] mt-[3px] tracking-[0.04em]" style={{ color: "var(--bone-3)" }}>{row.name}</span>
                        </span>
                        <span className="font-mono font-medium text-[10.5px] tracking-[0.16em] uppercase" style={{ color: "var(--bone-2)" }}>{row.kind}</span>
                        <span className="inline-flex items-center gap-[6px] px-[9px] py-[5px] font-mono font-medium text-[10px] tracking-[0.18em] uppercase w-fit"
                              style={{ border: "1px solid rgba(198,255,58,0.35)", color: "var(--lime)" }}>
                          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--lime)" }} />
                          secured
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavItem({ item, active, auth, onClick }: {
  item: typeof NAV_ITEMS[number]; active: boolean; auth?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-[10px] px-[10px] py-2 border font-mono text-[13px] text-left w-full cursor-pointer transition-colors"
      style={{
        borderColor: active ? (auth ? "rgba(255,91,31,0.20)" : "rgba(198,255,58,0.20)") : "transparent",
        background: active ? (auth ? "rgba(255,91,31,0.06)" : "rgba(198,255,58,0.06)") : "transparent",
        color: active ? (auth ? "var(--plasma)" : "var(--lime)") : "var(--bone-2)",
      }}
    >
      <span className="font-mono text-[10.5px] w-[18px]"
            style={{ color: active ? (auth ? "var(--plasma)" : "var(--lime)") : "var(--bone-4)" }}>
        {item.ix}
      </span>
      <span>{item.label}</span>
    </button>
  )
}

function Panel({ dot, title, subtitle, policyLabel, policyColor, children }: {
  dot: "lime" | "plasma"; title: string; subtitle: string
  policyLabel: string; policyColor: string; children: React.ReactNode
}) {
  return (
    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)", display: "grid", gridTemplateColumns: "1fr" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-[14px] border-b col-span-full"
           style={{ borderColor: "var(--rule)", color: "var(--bone-2)", fontSize: 12.5 }}>
        <div className="flex items-center gap-3 font-mono">
          <span className="w-[7px] h-[7px] rounded-full"
                style={{ background: dot === "lime" ? "var(--lime)" : "var(--plasma)", boxShadow: dot === "lime" ? "0 0 0 3px rgba(198,255,58,0.12)" : "0 0 0 3px rgba(255,91,31,0.12)" }} />
          <span>{title}</span>
          <span style={{ color: "var(--bone-4)" }}>·</span>
          <span style={{ color: "var(--bone-3)" }}>{subtitle}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>
          <span>policy in play</span>
          <span className="font-mono" style={{ color: policyColor }}>{policyLabel}</span>
        </div>
      </div>
      {/* Body grid */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }}>
        {children}
      </div>
    </div>
  )
}

function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="p-6 min-w-0">{children}</div>
}

function PanelAside({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 min-w-0 border-l" style={{ borderColor: "var(--rule)", background: "rgba(255,255,255,0.012)" }}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block font-mono text-[10.5px] tracking-[0.18em] uppercase mb-2" style={{ color: "var(--bone-3)" }}>
      {children}
    </span>
  )
}

function AmountInput({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="flex items-center gap-2 border px-4 py-3" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
      <input
        type="text" inputMode="decimal"
        value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono"
        style={{ color: "var(--bone)", fontSize: 22, lineHeight: 1, caretColor: "var(--lime)" }}
      />
      <span className="font-mono text-[13px]" style={{ color: "var(--bone-3)" }}>{unit}</span>
    </div>
  )
}

function ActionBtn({ over, onClick, children }: { over: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-4 px-6 mt-[18px] font-mono font-semibold text-[13px] tracking-[0.18em] uppercase cursor-pointer transition-colors"
      style={{
        background: over ? "var(--plasma)" : "var(--lime)",
        color: "var(--ink)", border: "none",
      }}
    >
      {children}
    </button>
  )
}

function MetaRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-[11px] border-b font-mono text-[12.5px]"
         style={{ borderColor: "var(--rule)" }}>
      <span className="font-medium text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-3)" }}>{k}</span>
      <span style={{ color: color ?? "var(--bone)" }}>{v}</span>
    </div>
  )
}

function CheckRow({ ok, title, sub }: { ok: boolean; title: string; sub: string }) {
  return (
    <div className="grid gap-3 items-start p-[12px] border font-mono"
         style={{
           gridTemplateColumns: "16px 1fr",
           borderColor: ok ? "rgba(198,255,58,0.30)" : "rgba(255,91,31,0.30)",
           background: ok ? "rgba(198,255,58,0.04)" : "rgba(255,91,31,0.04)",
         }}>
      <span style={{ color: ok ? "var(--lime)" : "var(--plasma)" }}>{ok ? "✓" : "×"}</span>
      <div>
        <div className="text-[13px] mb-[2px]" style={{ color: "var(--bone)" }}>{title}</div>
        <div className="text-[11.5px]" style={{ color: "var(--bone-3)" }}>{sub}</div>
      </div>
    </div>
  )
}

function StepRow({ n, done, cur, title, sub }: { n: number; done?: boolean; cur?: boolean; title: string; sub: string }) {
  return (
    <li className="grid gap-[14px] items-start py-[14px] border-b font-mono" style={{ gridTemplateColumns: "32px 1fr", borderColor: "var(--rule)" }}>
      <span className="w-[26px] h-[26px] flex items-center justify-center text-center font-medium text-[11px] border"
            style={{
              borderColor: done ? "rgba(198,255,58,0.40)" : cur ? "rgba(255,91,31,0.40)" : "var(--rule-2)",
              background: done ? "rgba(198,255,58,0.06)" : cur ? "rgba(255,91,31,0.06)" : "transparent",
              color: done ? "var(--lime)" : cur ? "var(--plasma)" : "var(--bone-3)",
            }}>
        {n}
      </span>
      <div>
        <div className="text-[13px] mb-1" style={{ color: "var(--bone)" }}>{title}</div>
        <div className="text-[11.5px] break-words" style={{ color: done ? "var(--lime)" : "var(--bone-3)" }}>{sub}</div>
      </div>
    </li>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const svgBase = "fill-none stroke-current"
function ClockIcon()    { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> }
function CheckIcon()    { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><path d="m5 12 5 5 9-9"/></svg> }
function WarnIcon()     { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18v.5"/></svg> }
function WalletIcon()   { return <svg className={`${svgBase} w-[12px] h-[12px]`} viewBox="0 0 24 24" strokeWidth="1.6"><rect x="3" y="6" width="18" height="13" rx="1"/><path d="M16 12h2"/></svg> }
function KeyIcon()      { return <svg className={`${svgBase} w-[12px] h-[12px]`} viewBox="0 0 24 24" strokeWidth="1.6"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function DepositIcon()  { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></svg> }
function WithdrawIcon() { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 20V8M6 12l6-6 6 6M4 4h16"/></svg> }
function UpgradeIcon()  { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M4 6h6M4 12h12M4 18h8"/><circle cx="18" cy="6" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg> }
