"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useWallet, useConnection }   from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js"
import { SiteNav }                    from "@/components/SiteNav"
import {
  TRANA_GUARD_ID,
  TRANA_AUTHORITY_ID,
  DEMO_VAULT_AUTHORITY,
} from "@/lib/devnet"
import {
  getPoolPda,
  getUserDepositPda,
  getRegistryPda,
  fetchPoolState,
  fetchUserDeposit,
  buildDepositIx,
  buildWithdrawIx,
  buildRegisterPasskeyIx,
  fetchRegistryNonce,
  fetchFirstPasskey,
  fetchAllPasskeys,
  buildAddPasskeyIx,
  WITHDRAW_LIMIT,
  COOLDOWN_SLOTS,
  DRAIN_WINDOW_SEC,
  type UserDepositState,
} from "@/lib/vault"
import {
  registerPasskey,
  signIntent,
  buildSecp256r1Ix,
  buildRecordProofIx,
  buildWebAuthnMessage,
  buildIntent,
  hashIntent,
  intentFromInstruction,
  TranaAuthorityClient,
} from "@tranaprotocol/sdk"

// ── Types ─────────────────────────────────────────────────────────────────────

type Route =
  | "vault/withdraw" | "vault/deposit"
  | "auth/programs"  | "auth/upgrade" | "auth/passkeys" | "auth/list"
type TxResult =
  | { s: "idle" }
  | { s: "pending"; msg: string }
  | { s: "ok";  msg: string; sig?: string }
  | { s: "err"; msg: string; sig?: string }

interface ConsoleLine { ts: string; cls: "eval" | "ok" | "err"; msg: string }

// ── Utilities ─────────────────────────────────────────────────────────────────

function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const shortAddr = (s: string) => s.slice(0, 4) + "…" + s.slice(-4)
const shortSig  = (s: string) => s.slice(0, 4) + "…" + s.slice(-4)
const nowTs = () => {
  const t = new Date()
  return `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}`
}
function wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

function parseErrMsg(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 120)

  // WalletSendTransactionError wraps a SendTransactionError which may have tx logs
  const inner = (e as any).error ?? (e as any).cause
  if (inner instanceof Error) {
    const logs: string[] | undefined = (inner as any).logs
    if (logs?.length) {
      const anchorErr = [...logs].reverse().find(l => l.includes("Error Message:"))
      if (anchorErr) return anchorErr.replace(/.*Error Message: /, "")
      const prog = [...logs].reverse().find(l => l.includes("custom program error"))
      if (prog) {
        const hex = prog.match(/custom program error: (0x[0-9a-f]+)/i)?.[1]
        if (hex) return codeToMsg(parseInt(hex, 16), hex)
      }
    }
    return parseErrMsg(inner)
  }

  const m = e.message

  // {"InstructionError":[n,{"Custom":6007}]} — may be embedded after a prefix like "tx failed: ..."
  const jsonSnippet = m.match(/\{.*\}/)
  if (jsonSnippet) {
    try {
      const ix = JSON.parse(jsonSnippet[0])
      const custom = ix?.InstructionError?.[1]?.Custom
      if (typeof custom === "number") return codeToMsg(custom, String(custom))
    } catch {}
  }

  // "custom program error: 0x1777" — from logs or SendTransactionError message
  const custom = m.match(/custom program error: (0x[0-9a-f]+)/i)
  if (custom) return codeToMsg(parseInt(custom[1], 16), custom[1])

  if (m.toLowerCase().includes("not connected") || m.toLowerCase().includes("wallet not connected"))
    return "Wallet disconnected — reconnect and try again"
  if (m.includes("passkey") || m.includes("proof") || m.includes("Secp256r1"))
    return "Proof required — passkey needed for this action"
  if (m.includes("insufficient")) return "Insufficient funds"
  return m.slice(0, 120)
}

function codeToMsg(code: number, fallback: string): string {
  switch (code) {
    case 6000: return "Missing passkey proof — add secp256r1 + record_proof instructions before this one"
    case 6001: return "Proof expired — sign and submit faster, or try again"
    case 6002: return "Payload mismatch — transaction parameters were tampered"
    case 6003: return "Wrong signer — passkey not in registry. Register this device first"
    case 6004: return "Invalid proof data"
    case 6005: return "Nonce overflow"
    case 6006: return "Policy mismatch — proof policy doesn't match the expected standard"
    case 6007: return "Unauthorized — caller is not the config authority"
    case 6008: return "Invalid treasury account"
    case 6009: return "Max passkeys reached — registry already has 10 keys"
    case 6010: return "Cannot remove the last registered passkey"
    case 6011: return "Credential not found — no passkey with that ID in registry"
    case 6012: return "Registry required — passkey registry account missing"
    default:   return `Program error ${fallback}`
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { route: "vault/deposit"  as Route, ix: "01", label: "Deposit",             group: "demo" },
  { route: "vault/withdraw" as Route, ix: "02", label: "The vault attack",    group: "demo" },
  { route: "auth/programs"  as Route, ix: "03", label: "Secure a program",    group: "auth", soon: true },
  { route: "auth/upgrade"   as Route, ix: "04", label: "Upgrade program",     group: "auth", soon: true },
  { route: "auth/passkeys"  as Route, ix: "05", label: "Manage passkeys",     group: "auth", soon: true },
  { route: "auth/list"      as Route, ix: "06", label: "Secured authorities", group: "auth", soon: true },
] as const

const VAULT_META: Record<string, { title: string; lede: React.ReactNode }> = {
  "vault/withdraw": {
    title: "The vault attack.",
    lede: (
      <>We give you the <em>seed phrase</em> for the pool authority. With it,
      you control the wallet that owns this vault.{" "}
      <span style={{ color: "var(--plasma)" }}>Drain it.</span> If you can.</>
    ),
  },
  "vault/deposit": {
    title: "Deposit.",
    lede: <>Anyone can deposit into the shared pool. <em>No passkey required.</em> Withdrawals are policy-gated.</>,
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
  "auth/upgrade": {
    title: "Upgrade a secured program.",
    lede: <>Write the new binary to a buffer, paste the address, approve with your passkey. The wallet key alone is rejected.</>,
  },
  "auth/passkeys": {
    title: "Manage passkeys.",
    lede: <>Add a backup passkey to your registry. Proof from your current key required — you control which devices can approve transactions.</>,
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

// ── Wallet button ─────────────────────────────────────────────────────────────

function WalletButton() {
  const { publicKey, connected, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [open, setOpen] = useState(false)

  if (!connected || !publicKey) {
    return (
      <button
        className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em] cursor-pointer"
        style={{ border: "1px solid var(--lime)", color: "var(--ink)", background: "var(--lime)" }}
        onClick={() => setVisible(true)}
      >
        Connect
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em] cursor-pointer"
        style={{ border: "1px solid rgba(198,255,58,0.35)", background: "rgba(198,255,58,0.06)", color: "var(--lime)" }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "var(--lime)" }} />
        {shortAddr(publicKey.toBase58())}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 flex flex-col min-w-[160px] py-1"
            style={{ background: "var(--ink-2)", border: "1px solid var(--rule-2)" }}
          >
            {[
              { label: "Copy address", action: () => { navigator.clipboard.writeText(publicKey.toBase58()); setOpen(false) } },
              { label: "Change wallet", action: () => { setVisible(true); setOpen(false) } },
              { label: "Disconnect",    action: () => { disconnect(); setOpen(false) } },
            ].map(({ label, action }) => (
              <button
                key={label}
                onClick={action}
                className="px-4 py-[9px] text-left font-mono text-[11px] tracking-[0.06em] cursor-pointer transition-colors"
                style={{ color: "var(--bone-2)", background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(235,232,224,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TryPage() {
  const { connection }                            = useConnection()
  const { publicKey, connected, sendTransaction } = useWallet()
  const { setVisible: openWalletModal }           = useWalletModal()

  const [route, setRoute]     = useState<Route>("vault/deposit")
  const [slot, setSlot]       = useState<number | null>(null)
  const [sideOpen, setSideOpen] = useState(false)

  // pool / deposit state
  const [poolLamports, setPoolLamports]   = useState<number | null>(null)
  const [poolExists, setPoolExists]       = useState<boolean | null>(null)
  const [userDeposit, setUserDeposit]     = useState<UserDepositState | null>(null)
  const [poolPda, setPoolPda]             = useState<PublicKey | null>(null)

  // passkey credential (persisted across retries within the session)
  const passkeyRef = useRef<{ credentialId: Uint8Array; pubkeyBytes: Uint8Array } | null>(null)

  // tx state
  const [wAmt, setWAmt]       = useState("0.40")
  const [depAmt, setDepAmt]   = useState("0.5")
  const [activeChip, setActiveChip] = useState("0.5")
  const [wLast, setWLast]     = useState<TxResult>({ s: "idle" })
  const [depLast, setDepLast] = useState<TxResult>({ s: "idle" })
  const [upgLast, setULast]   = useState<TxResult>({ s: "idle" })
  const [upgTarget, setUpgTarget] = useState("8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa")
  const [upgBuffer, setUpgBuffer] = useState("")
  const [pkLast, setPkLast]   = useState<TxResult>({ s: "idle" })
  const [pkGenerated, setPkGenerated] = useState<{ pubkeyHex: string; credIdHex: string } | null>(null)

  // auth state
  const [authTarget, setAuthTarget]   = useState("")
  const [authBusy, setAuthBusy]       = useState(false)
  const [authStatus, setAuthStatus]   = useState<string | null>(null)
  const [amTxsig, setAmTxsig]         = useState<string | null>(null)
  const [step2Done, setStep2Done]     = useState(false)
  const [step3Done, setStep3Done]     = useState(false)
  const [lines, setLines] = useState<ConsoleLine[]>([
    { ts: nowTs(), cls: "eval", msg: "$ trana auth secure --kind program-upgrade" },
    { ts: nowTs(), cls: "eval", msg: "awaiting target program ID…" },
  ])

  const consoleRef  = useRef<HTMLDivElement>(null)
  const authRunning = useRef(false)

  // ── Compute pool PDA when demo authority is set ───────────────────────────
  useEffect(() => {
    if (!DEMO_VAULT_AUTHORITY) return   // leave poolExists as null → shows "…"
    try {
      const auth = new PublicKey(DEMO_VAULT_AUTHORITY)
      setPoolPda(getPoolPda(auth))
    } catch {
      setPoolExists(false)
    }
  }, [])

  // ── Fetch pool state ──────────────────────────────────────────────────────
  const refreshPool = useCallback(async () => {
    if (!poolPda) return
    const state = await fetchPoolState(connection, poolPda)
    setPoolExists(state.exists)
    setPoolLamports(state.lamports)
  }, [connection, poolPda])

  useEffect(() => {
    refreshPool()
    const id = setInterval(refreshPool, 8_000)
    return () => clearInterval(id)
  }, [refreshPool])

  // ── Restore passkey credential from on-chain registry when wallet connects ─
  useEffect(() => {
    if (!publicKey) return
    fetchFirstPasskey(connection, publicKey).then(p => {
      if (p) passkeyRef.current = p
    })
  }, [publicKey, connection])

  // ── Fetch user deposit state ───────────────────────────────────────────────
  const refreshDeposit = useCallback(async () => {
    if (!publicKey || !poolPda) return
    const depositPda = getUserDepositPda(poolPda, publicKey)
    setUserDeposit(await fetchUserDeposit(connection, depositPda))
  }, [connection, publicKey, poolPda])

  useEffect(() => {
    refreshDeposit()
    const id = setInterval(refreshDeposit, 6_000)
    return () => clearInterval(id)
  }, [refreshDeposit])

  // ── Live slot ─────────────────────────────────────────────────────────────
  useEffect(() => {
    connection.getSlot("confirmed").then(setSlot)
    const id = setInterval(() => connection.getSlot("confirmed").then(setSlot), 2_000)
    return () => clearInterval(id)
  }, [connection])

  // ── Console auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [lines])

  function addLine(cls: ConsoleLine["cls"], msg: string) {
    setLines(prev => [...prev, { ts: nowTs(), cls, msg }])
  }

  // ── Withdraw ──────────────────────────────────────────────────────────────
  async function handleWithdraw() {
    const lamports = BigInt(Math.round((parseFloat(wAmt) || 0) * 1e9))
    if (lamports <= 0n) return
    if (!connected || !publicKey) { openWalletModal(true); return }
    if (!poolPda || !poolExists) {
      setWLast({ s: "err", msg: "Demo pool not initialized on devnet yet" })
      return
    }
    if (poolLamports !== null && BigInt(poolLamports) < lamports) {
      setWLast({ s: "err", msg: `Pool only has ${(poolLamports / 1e9).toFixed(4)} SOL — deposit more or reduce amount` })
      return
    }

    const rpId        = window.location.hostname
    const registryPda = getRegistryPda(publicKey)
    const depositPda  = getUserDepositPda(poolPda, publicKey)
    const GUARD       = new PublicKey(TRANA_GUARD_ID)

    setWLast({ s: "pending", msg: "Simulating…" })
    try {
      const withdrawIx = buildWithdrawIx(poolPda, depositPda, publicKey, publicKey, registryPda, lamports)

      // ── Step 1: ensure registry exists ───────────────────────────────────
      const registryInfo = await connection.getAccountInfo(registryPda)
      if (!registryInfo) {
        setWLast({ s: "pending", msg: "No passkey registered — Touch ID will prompt to create one…" })
        const cred  = await registerPasskey(rpId, publicKey.toBytes(), shortAddr(publicKey.toBase58()))
        passkeyRef.current = cred
        const regIx = await buildRegisterPasskeyIx(publicKey, connection, cred.pubkeyBytes, cred.credentialId)
        const regTx = new Transaction().add(regIx)
        const { blockhash: rb, lastValidBlockHeight: rlvh } = await connection.getLatestBlockhash("confirmed")
        regTx.recentBlockhash = rb; regTx.feePayer = publicKey
        const regSig = await sendTransaction(regTx, connection, { skipPreflight: true })
        const regResult = await connection.confirmTransaction({ signature: regSig, blockhash: rb, lastValidBlockHeight: rlvh }, "confirmed")
        if (regResult.value.err) throw new Error(`Passkey registration tx failed: ${JSON.stringify(regResult.value.err)}`)
        setWLast({ s: "pending", msg: "Passkey registered — continuing…" })
      } else {
        // Registry exists — restore credential from chain (source of truth)
        const onChain = await fetchFirstPasskey(connection, publicKey)
        if (onChain) passkeyRef.current = onChain
      }

      // ── Step 2: simulate plain withdraw (works for under-limit) ──────────
      const buildPlainTx = async () => {
        const tx = new Transaction().add(withdrawIx)
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
        tx.recentBlockhash = blockhash; tx.feePayer = publicKey
        return { tx, blockhash, lastValidBlockHeight }
      }

      let { tx, blockhash, lastValidBlockHeight } = await buildPlainTx()
      const sim = await connection.simulateTransaction(tx)
      const simLogs = sim.value.logs ?? []
      const needsProof = simLogs.some(l => l.includes("MissingProof"))

      if (needsProof) {
        // ── Step 3: build proof transaction with WebAuthn ─────────────────
        // Detect which policy the guard requires from simulation logs
        const notBeforeLog = simLogs.find(l => l.includes("policy=trana.not_before"))
        const proofPolicy  = notBeforeLog ? "trana.not_before" : "trana.limit"
        const label = notBeforeLog ? "Burst window — Touch ID required to proceed…" : "Over limit — Touch ID will prompt to approve…"
        setWLast({ s: "pending", msg: label })

        // Ensure we have the credential — register if missing
        if (!passkeyRef.current) {
          setWLast({ s: "pending", msg: "Touch ID will prompt to create a passkey…" })
          const cred  = await registerPasskey(rpId, publicKey.toBytes(), shortAddr(publicKey.toBase58()))
          passkeyRef.current = cred
            const regIx = await buildRegisterPasskeyIx(publicKey, connection, cred.pubkeyBytes, cred.credentialId)
          const regTx = new Transaction().add(regIx)
          const { blockhash: rb, lastValidBlockHeight: rlvh } = await connection.getLatestBlockhash("confirmed")
          regTx.recentBlockhash = rb; regTx.feePayer = publicKey
          const regSig = await sendTransaction(regTx, connection, { skipPreflight: true })
          await connection.confirmTransaction({ signature: regSig, blockhash: rb, lastValidBlockHeight: rlvh }, "confirmed")
        }
        const { credentialId, pubkeyBytes } = passkeyRef.current

        const nonce  = await fetchRegistryNonce(connection, publicKey)
        const intent = buildIntent(
          publicKey, GUARD,
          intentFromInstruction(withdrawIx),
          nonce,
          { policy: proofPolicy, expiryTtlSec: 120 },
        )
        const challenge = hashIntent(intent)

        const signing = await signIntent(challenge, credentialId, rpId)
        // Give the wallet a moment to re-initialize after the WebAuthn dialog took focus
        await new Promise(r => setTimeout(r, 300))
        const { signature, authenticatorData, clientDataJSON } = signing
        // If the credential that actually signed differs from our stored credentialId,
        // look up the matching pubkey from the registry (shouldn't happen with specific allowCredentials).
        let signingPubkey = pubkeyBytes
        if (!uint8Equal(signing.credentialId, credentialId)) {
          const all = await fetchAllPasskeys(connection, publicKey)
          const match = all.find(e => uint8Equal(e.credentialId, signing.credentialId))
          if (!match) throw new Error("Selected passkey is not registered for this wallet. Use a fresh wallet.")
          signingPubkey = match.pubkeyBytes
        }

        const message      = buildWebAuthnMessage(authenticatorData, clientDataJSON)
        const secp256r1Ix  = buildSecp256r1Ix(signingPubkey, signature, message)
        const recordProofIx = buildRecordProofIx(GUARD, authenticatorData, clientDataJSON, intent.expiryUnix, proofPolicy)

        const proofTx = new Transaction().add(secp256r1Ix, recordProofIx, withdrawIx)
        const { blockhash: pb, lastValidBlockHeight: plvh } = await connection.getLatestBlockhash("confirmed")
        proofTx.recentBlockhash = pb; proofTx.feePayer = publicKey
        ;({ tx, blockhash, lastValidBlockHeight } = { tx: proofTx, blockhash: pb, lastValidBlockHeight: plvh })
      } else if (sim.value.err) {
        console.error("[trana] simulation failed:", sim.value.err)
        if (simLogs.length) console.error("[trana] sim logs:\n" + simLogs.join("\n"))
        const anchorErr = simLogs.findLast(l => l.includes("Error Message:"))
        const progErr   = simLogs.findLast(l => l.includes("custom program error"))
        setWLast({ s: "err", msg: anchorErr ?? progErr ?? JSON.stringify(sim.value.err) })
        return
      }

      setWLast({ s: "pending", msg: "Sending transaction…" })
      let txSig: string | null = null
      try {
        txSig = await sendTransaction(tx, connection, { skipPreflight: true })
        setWLast({ s: "pending", msg: "Confirming…" })
        const result = await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed")
        if (result.value.err) {
          console.error("[trana] on-chain tx failed:", result.value.err, "sig:", txSig)
          throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
        }
      } catch (sendErr) {
        // Phantom sometimes signs+submits successfully then throws an internal error.
        if (txSig) {
          // We have the sig — check if it confirmed despite the error.
          const status = await connection.getSignatureStatus(txSig, { searchTransactionHistory: false })
          const conf = status.value?.confirmationStatus
          if ((conf === "confirmed" || conf === "finalized") && !status.value?.err) {
            await Promise.all([refreshPool(), refreshDeposit()])
            setWLast({ s: "ok", msg: `Withdrawn ${wAmt} SOL`, sig: txSig })
            return
          }
        } else {
          // No sig returned — Phantom may have thrown before submitting.
          // Wait briefly then check recent signatures for this wallet.
          await new Promise(r => setTimeout(r, 1500))
          const recent = await connection.getSignaturesForAddress(publicKey, { limit: 1 })
          if (recent[0] && !recent[0].err && Date.now() / 1000 - (recent[0].blockTime ?? 0) < 20) {
            await Promise.all([refreshPool(), refreshDeposit()])
            setWLast({ s: "ok", msg: `Withdrawn ${wAmt} SOL`, sig: recent[0].signature })
            return
          }
        }
        throw sendErr
      }
      await Promise.all([refreshPool(), refreshDeposit()])
      setWLast({ s: "ok", msg: `Withdrawn ${wAmt} SOL`, sig: txSig })
    } catch (e) {
      const msg = parseErrMsg(e)
      // Log the full error so devtools shows the real cause
      const inner = (e as any)?.error ?? (e as any)?.cause
      const logs: string[] | undefined = (inner as any)?.logs ?? (e as any)?.logs
      if (logs?.length) {
        console.error("[trana] tx logs:\n" + logs.join("\n"))
      }
      console.error("[trana] withdraw error:", e)
      setWLast({ s: "err", msg })
    }
  }

  // ── Deposit ───────────────────────────────────────────────────────────────
  async function handleDeposit() {
    const lamports = BigInt(Math.round((parseFloat(depAmt) || 0) * 1e9))
    if (lamports <= 0n) return
    if (!connected || !publicKey) { openWalletModal(true); return }
    if (!poolPda || !poolExists) {
      setDepLast({ s: "err", msg: "Demo pool not initialized on devnet yet" })
      return
    }

    setDepLast({ s: "pending", msg: "Sending transaction…" })
    try {
      const depositPda = getUserDepositPda(poolPda, publicKey)
      const ix = buildDepositIx(poolPda, depositPda, publicKey, lamports)
      const tx = new Transaction().add(ix)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      await refreshPool()
      setDepLast({ s: "ok", msg: `Deposited ${depAmt} SOL`, sig })
    } catch (e) {
      setDepLast({ s: "err", msg: parseErrMsg(e) })
    }
  }

  // ── Upgrade with leaked wallet key (will fail — not the authority) ────────
  async function handleUpgradeLeak() {
    if (!connected || !publicKey) { openWalletModal(true); return }
    setULast({ s: "pending", msg: "Sending direct upgrade attempt…" })
    try {
      let targetPk: PublicKey
      try { targetPk = new PublicKey(upgTarget) } catch { setULast({ s: "err", msg: "Invalid program ID" }); return }
      if (!upgBuffer.trim()) { setULast({ s: "err", msg: "Paste a buffer address first" }); return }
      let bufPk: PublicKey
      try { bufPk = new PublicKey(upgBuffer) } catch { setULast({ s: "err", msg: "Invalid buffer address" }); return }

      const progInfo = await connection.getAccountInfo(targetPk)
      if (!progInfo) { setULast({ s: "err", msg: "Program not found" }); return }
      const programDataAddr = new PublicKey(progInfo.data.slice(4, 36))

      const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      const upgradeIx = new TransactionInstruction({
        programId: BPF_UPGRADEABLE,
        keys: [
          { pubkey: programDataAddr, isSigner: false, isWritable: true  },
          { pubkey: targetPk,        isSigner: false, isWritable: true  },
          { pubkey: bufPk,           isSigner: false, isWritable: true  },
          { pubkey: publicKey,       isSigner: true,  isWritable: true  }, // wrong authority
          { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"), isSigner: false, isWritable: false },
        ],
        data: Buffer.from([3, 0, 0, 0]), // Upgrade discriminant
      })
      const tx = new Transaction().add(upgradeIx)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash; tx.feePayer = publicKey
      const sig = await sendTransaction(tx, connection, { skipPreflight: true })
      const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      if (res.value.err) throw new Error(`Rejected on-chain: ${JSON.stringify(res.value.err)}`)
      setULast({ s: "ok", msg: "Upgraded (unexpected — is the PDA still the authority?)", sig })
    } catch (e) {
      setULast({ s: "err", msg: "Reverted · BPF Loader · " + parseErrMsg(e), })
    }
  }

  // ── Upgrade with passkey (real Touch ID + execute_upgrade CPI) ─────────────
  async function handleUpgradePasskey() {
    if (!connected || !publicKey) { openWalletModal(true); return }
    if (!upgBuffer.trim()) { setULast({ s: "err", msg: "Paste the buffer address from `solana program write-buffer`" }); return }

    let targetPk: PublicKey, bufPk: PublicKey
    try { targetPk = new PublicKey(upgTarget) } catch { setULast({ s: "err", msg: "Invalid program ID" }); return }
    try { bufPk = new PublicKey(upgBuffer.trim()) } catch { setULast({ s: "err", msg: "Invalid buffer address" }); return }

    const GUARD = new PublicKey(TRANA_GUARD_ID)
    const authorityClient = new TranaAuthorityClient({ connection, cluster: "devnet" })
    const rpId = window.location.hostname

    setULast({ s: "pending", msg: "Reading on-chain state…" })
    try {
      const progInfo = await connection.getAccountInfo(targetPk)
      if (!progInfo) throw new Error("Program not found on devnet")
      const programDataAddr = new PublicKey(progInfo.data.slice(4, 36))

      // Ensure passkey registered
      const registryPda = getRegistryPda(publicKey)
      const registryInfo = await connection.getAccountInfo(registryPda)
      if (!registryInfo) {
        setULast({ s: "pending", msg: "No passkey — Touch ID will register one…" })
        const cred = await registerPasskey(rpId, publicKey.toBytes(), shortAddr(publicKey.toBase58()))
        passkeyRef.current = cred
        const regIx = await buildRegisterPasskeyIx(publicKey, connection, cred.pubkeyBytes, cred.credentialId)
        const regTx = new Transaction().add(regIx)
        const { blockhash: rb, lastValidBlockHeight: rlvh } = await connection.getLatestBlockhash("confirmed")
        regTx.recentBlockhash = rb; regTx.feePayer = publicKey
        const regSig = await sendTransaction(regTx, connection, { skipPreflight: true })
        const regResult = await connection.confirmTransaction({ signature: regSig, blockhash: rb, lastValidBlockHeight: rlvh }, "confirmed")
        if (regResult.value.err) throw new Error(`Registration failed: ${JSON.stringify(regResult.value.err)}`)
      } else {
        const onChain = await fetchFirstPasskey(connection, publicKey)
        if (onChain) passkeyRef.current = onChain
      }
      if (!passkeyRef.current) throw new Error("No passkey credential available")
      const { credentialId, pubkeyBytes } = passkeyRef.current

      // Build executeUpgrade instruction
      const executeUpgradeIx = await authorityClient.executeUpgrade({
        owner: publicKey, program: targetPk, programData: programDataAddr,
        buffer: bufPk, spill: publicKey,
      })

      // Sign intent with Touch ID
      const nonce = await fetchRegistryNonce(connection, publicKey)
      const intent = buildIntent(publicKey, GUARD, intentFromInstruction(executeUpgradeIx), nonce, { policy: "trana.require", expiryTtlSec: 120 })
      const challenge = hashIntent(intent)

      setULast({ s: "pending", msg: "Touch ID — approve the upgrade…" })
      const signing = await signIntent(challenge, credentialId, rpId)
      await new Promise(r => setTimeout(r, 300))
      const { signature, authenticatorData, clientDataJSON } = signing
      let signingPubkey = pubkeyBytes
      if (!uint8Equal(signing.credentialId, credentialId)) {
        const all = await fetchAllPasskeys(connection, publicKey)
        const match = all.find(e => uint8Equal(e.credentialId, signing.credentialId))
        if (!match) throw new Error("Selected passkey not registered for this wallet")
        signingPubkey = match.pubkeyBytes
      }

      const message = buildWebAuthnMessage(authenticatorData, clientDataJSON)
      const secp256r1Ix  = buildSecp256r1Ix(signingPubkey, signature, message)
      const recordProofIx = buildRecordProofIx(GUARD, authenticatorData, clientDataJSON, intent.expiryUnix, "trana.require")

      const tx = new Transaction().add(secp256r1Ix, recordProofIx, executeUpgradeIx)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash; tx.feePayer = publicKey

      setULast({ s: "pending", msg: "Sending upgrade transaction…" })
      let txSig: string | null = null
      try {
        txSig = await sendTransaction(tx, connection, { skipPreflight: true })
        const result = await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed")
        if (result.value.err) {
          console.error("[trana] upgrade failed:", result.value.err)
          throw new Error(`Upgrade failed: ${JSON.stringify(result.value.err)}`)
        }
      } catch (sendErr) {
        if (txSig) {
          const status = await connection.getSignatureStatus(txSig, { searchTransactionHistory: false })
          const conf = status.value?.confirmationStatus
          if ((conf === "confirmed" || conf === "finalized") && !status.value?.err) {
            setULast({ s: "ok", msg: `Program upgraded ✓`, sig: txSig }); return
          }
        }
        throw sendErr
      }
      setULast({ s: "ok", msg: `Program upgraded ✓`, sig: txSig! })
    } catch (e) {
      console.error("[trana] upgrade passkey error:", e)
      setULast({ s: "err", msg: parseErrMsg(e) })
    }
  }

  // ── Generate Touch ID credential bytes (for CLI add_passkey) ─────────────
  async function handleGenerateCredential() {
    if (!connected || !publicKey) { openWalletModal(true); return }
    setPkLast({ s: "pending", msg: "Touch ID — creating credential…" })
    setPkGenerated(null)
    try {
      const cred = await registerPasskey(window.location.hostname, publicKey.toBytes(), shortAddr(publicKey.toBase58()))
      const pubkeyHex = Array.from(cred.pubkeyBytes).map(b => b.toString(16).padStart(2, "0")).join("")
      const credIdHex = Array.from(cred.credentialId).map(b => b.toString(16).padStart(2, "0")).join("")
      setPkGenerated({ pubkeyHex, credIdHex })
      setPkLast({ s: "ok", msg: "Credential created — copy the command below and run it" })
    } catch (e) {
      setPkLast({ s: "err", msg: parseErrMsg(e) })
    }
  }

  // ── Add second passkey ────────────────────────────────────────────────────
  async function handleAddPasskey() {
    if (!connected || !publicKey) { openWalletModal(true); return }
    const GUARD = new PublicKey(TRANA_GUARD_ID)
    const rpId  = window.location.hostname
    setPkLast({ s: "pending", msg: "Checking existing passkey…" })
    try {
      // Must have an existing credential to sign the proof
      const existing = await fetchFirstPasskey(connection, publicKey)
      if (!existing) throw new Error("No passkey registered yet — withdraw over-limit first to register one")
      passkeyRef.current = existing

      // Step 1: create a NEW Touch ID credential
      setPkLast({ s: "pending", msg: "Touch ID — create new passkey…" })
      const newCred = await registerPasskey(rpId, publicKey.toBytes(), shortAddr(publicKey.toBase58()))

      // Step 2: sign add_passkey intent with EXISTING credential (discoverable — no QR)
      setPkLast({ s: "pending", msg: "Touch ID — approve with existing passkey…" })
      const nonce  = await fetchRegistryNonce(connection, publicKey)
      const addIx  = await buildAddPasskeyIx(publicKey, connection, newCred.pubkeyBytes, newCred.credentialId)
      const intent = buildIntent(publicKey, GUARD, intentFromInstruction(addIx), nonce, { policy: "trana.require", expiryTtlSec: 120 })
      const challenge = hashIntent(intent)
      // Pass null → discoverable flow: browser shows all local passkeys, no QR
      const signing = await signIntent(challenge, null, rpId)
      await new Promise(r => setTimeout(r, 300))

      // Look up which pubkey matches the credential that actually signed
      const all = await fetchAllPasskeys(connection, publicKey)
      const match = all.find(e => uint8Equal(e.credentialId, signing.credentialId))
      if (!match) throw new Error("The passkey you used is not registered for this wallet — use a registered credential")
      let signingPubkey = match.pubkeyBytes

      const message       = buildWebAuthnMessage(signing.authenticatorData, signing.clientDataJSON)
      const secp256r1Ix   = buildSecp256r1Ix(signingPubkey, signing.signature, message)
      const recordProofIx = buildRecordProofIx(GUARD, signing.authenticatorData, signing.clientDataJSON, intent.expiryUnix, "trana.require")

      const tx = new Transaction().add(secp256r1Ix, recordProofIx, addIx)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash; tx.feePayer = publicKey

      setPkLast({ s: "pending", msg: "Sending…" })
      const sig    = await sendTransaction(tx, connection, { skipPreflight: true })
      const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      if (result.value.err) throw new Error(`Failed: ${JSON.stringify(result.value.err)}`)

      // Update ref to new credential
      passkeyRef.current = newCred
      await refreshDeposit()
      setPkLast({ s: "ok", msg: "New passkey added to registry", sig })
    } catch (e) {
      console.error("[trana] add passkey error:", e)
      setPkLast({ s: "err", msg: parseErrMsg(e) })
    }
  }

  // ── Auth secure (real on-chain) ──────────────────────────────────────────
  async function handleAuthSecure() {
    if (authRunning.current || authBusy) return
    authRunning.current = true
    if (!connected || !publicKey) { openWalletModal(true); authRunning.current = false; return }
    if (authTarget.length < 32) {
      addLine("err", "paste a valid program ID first"); authRunning.current = false; return
    }

    let targetPubkey: PublicKey
    try { targetPubkey = new PublicKey(authTarget) }
    catch { addLine("err", "invalid program ID"); authRunning.current = false; return }

    const authorityClient = new TranaAuthorityClient({ connection, cluster: "devnet" })
    const pda      = authorityClient.recordPda(publicKey, targetPubkey)
    const pdaShort = shortAddr(pda.toBase58())

    setLines([])
    setAuthBusy(true); setAuthStatus("submitting…")
    const push = (cls: ConsoleLine["cls"], msg: string) =>
      setLines(prev => [...prev, { ts: nowTs(), cls, msg }])

    push("eval", `$ trana auth secure --kind program-upgrade --target ${shortAddr(authTarget)}`)
    push("eval", `owner: ${shortAddr(publicKey.toBase58())}`)
    push("eval", `derived PDA: ${pdaShort}`)
    push("eval", "seeds: [ trana-authority, owner, target ]")

    try {
      // Step 1: check current upgrade authority
      const progInfo = await connection.getAccountInfo(targetPubkey)
      if (!progInfo) throw new Error("program account not found on devnet")
      // Upgradeable program account: 4-byte discriminant + 32-byte programdata address
      const programDataAddr = new PublicKey(progInfo.data.slice(4, 36))
      const pdInfo = await connection.getAccountInfo(programDataAddr)
      if (!pdInfo) throw new Error("programData account not found")
      // programData layout: 4 discriminant + 8 slot + 1 option + 32 authority
      const currentAuthority = new PublicKey(pdInfo.data.slice(13, 45))
      if (!currentAuthority.equals(publicKey)) {
        push("err", `upgrade authority is ${shortAddr(currentAuthority.toBase58())} — connect that wallet`)
        setAuthBusy(false); authRunning.current = false; return
      }
      push("eval", `current upgrade authority: ${shortAddr(currentAuthority.toBase58())} ✓`)

      // Step 2: build register ix
      const registerIx = await authorityClient.register({ owner: publicKey, target: targetPubkey })
      push("eval", "ix[0] trana_authority::register")

      // Step 3: build bpf_loader set_authority ix
      const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      const setAuthIx = new TransactionInstruction({
        programId: BPF_UPGRADEABLE,
        keys: [
          { pubkey: programDataAddr, isSigner: false, isWritable: true  },
          { pubkey: publicKey,       isSigner: true,  isWritable: false },
          { pubkey: pda,             isSigner: false, isWritable: false },
        ],
        data: Buffer.from([4, 0, 0, 0]),  // SetAuthority discriminant
      })
      push("eval", "ix[1] bpf_loader::set_upgrade_authority")

      // Step 4: send
      push("eval", "sending transaction…")
      const tx = new Transaction().add(registerIx, setAuthIx)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      tx.recentBlockhash = blockhash; tx.feePayer = publicKey
      const sig = await sendTransaction(tx, connection)
      const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      if (result.value.err) throw new Error(`tx failed: ${JSON.stringify(result.value.err)}`)

      push("ok", "AuthorityRecord PDA initialized ✓")
      push("ok", `upgrade_authority → ${pdaShort}`)
      push("ok", `wallet key alone can no longer upgrade this program`)

      setStep2Done(true); setStep3Done(true)
      setAuthStatus("confirmed")
      setAmTxsig(sig)
    } catch (e) {
      push("err", parseErrMsg(e))
      console.error("[trana] auth secure error:", e)
      setAuthStatus("failed")
    }
    setAuthBusy(false)
    authRunning.current = false
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const poolSol    = poolLamports !== null ? poolLamports / 1e9 : null
  const wSliderVal = Math.max(0.01, Math.min(5, parseFloat(wAmt) || 0))
  const wFillPct   = ((wSliderVal - 0.01) / 4.99) * 100
  const wOver      = wSliderVal >= 1

  const isVault = route.startsWith("vault/")
  const vTab    = isVault ? (route.split("/")[1] as "withdraw" | "deposit") : null
  const crumbA  = isVault ? "vault" : "authority"
  const crumbB  = route.split("/")[1]
  const vMeta   = VAULT_META[route]
  const aMeta   = AUTH_META[route]

  // PDA for auth section
  let authPda: string | null = null
  if (authTarget.length >= 32 && publicKey) {
    try {
      const target = new PublicKey(authTarget)
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trana-authority"), publicKey.toBuffer(), target.toBuffer()],
        new PublicKey(TRANA_AUTHORITY_ID),
      )
      authPda = shortAddr(pda.toBase58())
    } catch { /* invalid input */ }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <SiteNav />

      <div className="sec-wrap">
      <div className="try-app">

        {/* ══ Sidebar ══ */}
        <aside
          className="try-sidebar border-r flex flex-col"
          style={{ borderColor: "var(--rule)", background: "var(--ink)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-[14px] py-[13px] border-b" style={{ borderColor: "var(--rule)" }}>
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase flex items-center gap-[7px]" style={{ color: "var(--plasma)" }}>
              <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--plasma)" }} />
              Devnet
            </span>
            <div className="flex items-center gap-[10px]">
              <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--bone-4)" }}>
                {slot !== null ? `#${slot.toLocaleString()}` : "…"}
              </span>
              <button
                className="flex md:hidden items-center justify-center w-[22px] h-[22px] cursor-pointer"
                style={{ border: "1px solid var(--rule-2)", color: "var(--bone-3)", background: "transparent" }}
                onClick={() => setSideOpen(o => !o)}
                aria-label={sideOpen ? "Close menu" : "Open menu"}
              >
                {sideOpen ? (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
                    <path d="M1 1 11 11M11 1 1 11"/>
                  </svg>
                ) : (
                  <svg width="11" height="7" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
                    <path d="M0 1h14M0 5h14M0 9h14"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Nav */}
          <div className={`flex-col flex-1 py-2 ${sideOpen ? "flex" : "hidden md:flex"}`}>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase px-[14px] pt-[12px] pb-[6px]" style={{ color: "var(--bone-4)" }}>
              Try the demo
            </div>
            {NAV_ITEMS.filter(n => n.group === "demo").map(n => (
              <NavItem key={n.route} item={n} active={route === n.route}
                onClick={() => { setRoute(n.route); setSideOpen(false) }} />
            ))}

            <div className="font-mono text-[10px] tracking-[0.22em] uppercase px-[14px] pt-[18px] pb-[6px]" style={{ color: "var(--bone-4)" }}>
              Manage authorities
            </div>
            {NAV_ITEMS.filter(n => n.group === "auth").map(n => (
              <NavItem key={n.route} item={n} active={false} auth
                disabled={"soon" in n && n.soon}
                onClick={"soon" in n && n.soon ? undefined : () => { setRoute(n.route); setSideOpen(false) }} />
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="mt-auto flex justify-between items-center px-[14px] py-[12px] border-t font-mono text-[10.5px]"
               style={{ borderColor: "var(--rule)", color: "var(--bone-4)" }}>
            <a
              href="/"
              className="flex items-center gap-[5px] transition-colors"
              style={{ color: "var(--bone-3)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--bone)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--bone-3)")}
            >
              ← trana.so
            </a>
            <span className="tracking-[0.06em]">v0.1.0</span>
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
              <a
                href="https://faucet.solana.com" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-[6px] px-3 py-[7px] font-mono text-[11px] tracking-[0.04em]"
                style={{ border: "1px solid var(--rule-2)", color: "var(--bone-2)" }}
              >
                <span className="hidden sm:inline">Get devnet SOL</span>
                <span>↗</span>
              </a>
              <WalletButton />
            </div>
          </div>

          {/* Page content */}
          <div className="px-5 sm:px-8 pt-9 pb-16">

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
                    { tab: "deposit",  icon: <DepositIcon />, name: "Deposit",          sub: "Top up the shared pool",     tag: "no passkey required",       tagCls: "" },
                    { tab: "withdraw", icon: <WithdrawIcon />, name: "Withdraw",        sub: "Try to drain the pool",      tag: "3 policies — discover them", tagCls: "lime" },
                  ].map(({ tab, icon, name, sub, tag, tagCls }) => (
                    <button
                      key={tab}
                      onClick={() => setRoute((`vault/${tab}`) as Route)}
                      className="text-left flex flex-col gap-2 p-[18px] border transition-colors cursor-pointer"
                      style={{
                        borderColor: vTab === tab ? "rgba(198,255,58,0.45)" : "var(--rule-2)",
                        background:  vTab === tab ? "rgba(198,255,58,0.04)" : "var(--ink-2)",
                      }}
                    >
                      <span style={{ color: vTab === tab ? "var(--lime)" : "var(--bone-3)" }}>{icon}</span>
                      <span className="font-mono text-[14px]" style={{ color: "var(--bone)" }}>{name}</span>
                      <span className="font-mono text-[12px]" style={{ color: "var(--bone-3)" }}>{sub}</span>
                      <span
                        className="inline-flex items-center gap-[6px] mt-[6px] px-[9px] py-[5px] w-fit font-mono font-medium text-[10px] tracking-[0.16em] uppercase"
                        style={{
                          border: tagCls === "lime" ? "1px solid rgba(198,255,58,0.30)" : tagCls === "plasma" ? "1px solid rgba(255,91,31,0.30)" : "1px solid var(--rule-2)",
                          color:  tagCls === "lime" ? "var(--lime)"                     : tagCls === "plasma" ? "var(--plasma)"                  : "var(--bone-3)",
                        }}
                      >
                        {tag}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ── Withdraw panel ── */}
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

                      <div className="mt-3 relative pt-[14px] pb-[6px]">
                        <input
                          type="range" min="0.01" max="5" step="0.01"
                          value={wSliderVal}
                          onChange={e => setWAmt(Number(e.target.value).toFixed(2))}
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
                        {!connected ? "Connect wallet →" : wOver ? "Approve & Withdraw ⚿" : "Withdraw →"}
                      </ActionBtn>
                      <div className="mt-3 font-mono text-[11.5px]" style={{ color: "var(--bone-3)" }}>
                        Pool balance ·{" "}
                        <span style={{ color: "var(--bone)" }}>
                          {poolExists === null ? "…" : !poolExists ? "not deployed" : poolSol === null ? "…" : poolSol === 0 ? <span style={{ color: "var(--plasma)" }}>drained — deposit to refill</span> : `${poolSol.toFixed(2)} SOL`}
                        </span>
                      </div>
                    </PanelBody>

                    <PanelAside>
                      <Label>Program IDs</Label>
                      <div className="flex flex-col gap-1 mb-4">
                        <MetaRow k="trana_guard"  v={shortAddr(TRANA_GUARD_ID)} />
                        <MetaRow k="vault"        v={shortAddr("8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa")} />
                        {poolPda && <MetaRow k="pool PDA" v={shortAddr(poolPda.toBase58())} />}
                      </div>

                      <Label>Last result</Label>
                      <LastResult r={wLast} />

                      <div className="mt-5">
                        <Label>Policy · live on-chain</Label>
                        <PolicyStatus deposit={userDeposit} slot={slot} />
                      </div>
                    </PanelAside>
                  </Panel>
                )}

                {/* ── Deposit panel ── */}
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
                              background:  activeChip === c ? "rgba(198,255,58,0.05)" : "transparent",
                              color:       activeChip === c ? "var(--lime)"            : "var(--bone-2)",
                            }}
                          >{c}</button>
                        ))}
                      </div>
                      <ActionBtn over={false} onClick={handleDeposit}>
                        {!connected ? "Connect wallet →" : "Deposit →"}
                      </ActionBtn>
                      <div className="mt-3 font-mono text-[11.5px]" style={{ color: "var(--bone-3)" }}>
                        Anyone can deposit. No passkey required.
                      </div>
                    </PanelBody>
                    <PanelAside>
                      <Label>Last result</Label>
                      <div style={{ marginBottom: 16 }}>
                        <LastResult r={depLast} />
                      </div>
                      <div className="font-mono text-[12.5px] leading-[1.7]" style={{ color: "var(--bone-2)" }}>
                        The vault is a shared pool. Deposits open the door <em style={{ color: "var(--bone)" }}>in</em>;
                        only <span style={{ color: "var(--lime)" }}>withdrawals</span> are policy-gated.
                      </div>
                      <MetaRow k="Pool balance"    v={poolExists === null ? "…" : poolExists ? `${(poolSol ?? 0).toFixed(2)} SOL` : "—"} />
                      <MetaRow k="Your deposit"    v={userDeposit?.balance && userDeposit.balance > 0n ? `${(Number(userDeposit.balance) / 1e9).toFixed(4)} SOL` : "—"} />
                      {poolPda && <MetaRow k="Pool PDA" v={shortAddr(poolPda.toBase58())} />}
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

                {/* ── Upgrade tool ── */}
                {route === "auth/upgrade" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-[18px] items-start">
                    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                      <div className="flex items-center justify-between px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)" }}>
                        <span className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Upgrade secured program</span>
                        <span className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>network: <span style={{ color: "var(--plasma)" }}>devnet</span></span>
                      </div>
                      <div className="p-6 flex flex-col gap-4">
                        <div>
                          <Label>Program ID</Label>
                          <div className="flex items-center gap-2 border px-4 py-3" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
                            <input type="text" value={upgTarget} onChange={e => setUpgTarget(e.target.value)}
                              placeholder="program to upgrade"
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[14px]"
                              style={{ color: "var(--bone)", caretColor: "var(--lime)" }} />
                          </div>
                        </div>
                        <div>
                          <Label>Buffer address <span style={{ color: "var(--bone-4)", textTransform: "none", letterSpacing: 0 }}>— from <code>solana program write-buffer</code></span></Label>
                          <div className="flex items-center gap-2 border px-4 py-3" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
                            <input type="text" value={upgBuffer} onChange={e => setUpgBuffer(e.target.value)}
                              placeholder="paste buffer address"
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[14px]"
                              style={{ color: "var(--bone)", caretColor: "var(--lime)" }} />
                          </div>
                        </div>
                        <button
                          onClick={handleUpgradePasskey}
                          disabled={!connected || !upgBuffer.trim()}
                          className="w-full py-4 px-6 font-mono font-semibold text-[13px] tracking-[0.18em] uppercase cursor-pointer transition-colors disabled:opacity-40"
                          style={{ background: "var(--lime)", color: "var(--ink)", border: "none" }}>
                          {!connected ? "Connect wallet →" : "Upgrade with passkey ⚿"}
                        </button>
                        <div className="font-mono text-[11.5px] leading-[1.7]" style={{ color: "var(--bone-3)" }}>
                          The owner wallet must match the AuthorityRecord. Passkey proof is required — wallet key alone is rejected by the BPF Loader.
                        </div>
                        <div className="flex items-start gap-[8px] border p-[10px] font-mono text-[11px]"
                             style={{ borderColor: "rgba(90,169,255,0.25)", background: "rgba(90,169,255,0.04)", color: "var(--bone-3)" }}>
                          <span style={{ color: "var(--azure)", flexShrink: 0 }}>ℹ</span>
                          <span>Seeing QR instead of Touch ID? Open in <span style={{ color: "var(--bone)" }}>Safari</span> — it uses iCloud Keychain and shows Touch ID directly.</span>
                        </div>
                      </div>
                    </div>
                    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                      <div className="px-6 py-[14px] border-b font-mono text-[12.5px]" style={{ borderColor: "var(--rule)", color: "var(--bone)" }}>Result</div>
                      <div className="p-6">
                        <LastResult r={upgLast} />
                        <div className="mt-5 flex flex-col gap-1">
                          {[
                            { k: "ix[0]", v: "secp256r1::verify P-256" },
                            { k: "ix[1]", v: "trana_guard::record_proof" },
                            { k: "ix[2]", v: "trana_authority::execute_upgrade" },
                          ].map(r => <MetaRow key={r.k} k={r.k} v={r.v} />)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Manage passkeys ── */}
                {route === "auth/passkeys" && (
                  <div className="flex flex-col gap-[18px]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">

                      {/* Path A — browser registered passkey */}
                      <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                        <div className="px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)" }}>
                          <div className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Add via browser</div>
                          <div className="font-mono text-[11px] mt-[2px]" style={{ color: "var(--bone-4)" }}>if your existing passkey was registered with Touch ID</div>
                        </div>
                        <div className="p-6 flex flex-col gap-3">
                          <div className="font-mono text-[11.5px] leading-[1.7]" style={{ color: "var(--bone-3)" }}>
                            Two Touch ID prompts: create new credential, then sign with existing to approve.
                          </div>
                          <button onClick={handleAddPasskey} disabled={!connected}
                            className="w-full py-3 px-6 font-mono font-semibold text-[12px] tracking-[0.18em] uppercase cursor-pointer transition-colors disabled:opacity-40"
                            style={{ background: "var(--lime)", color: "var(--ink)", border: "none" }}>
                            {!connected ? "Connect wallet →" : "Add passkey ⚿"}
                          </button>
                        </div>
                      </div>

                      {/* Path B — CLI registered passkey (shows QR in browser) */}
                      <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                        <div className="px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)" }}>
                          <div className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Add via CLI proof</div>
                          <div className="font-mono text-[11px] mt-[2px]" style={{ color: "var(--bone-4)" }}>if your registry was created with register-passkey.mjs (shows QR)</div>
                        </div>
                        <div className="p-6 flex flex-col gap-3">
                          <div className="font-mono text-[11.5px] leading-[1.7]" style={{ color: "var(--bone-3)" }}>
                            Touch ID creates the credential here, then run the script to sign the proof with your CLI key.
                          </div>
                          <button onClick={handleGenerateCredential} disabled={!connected}
                            className="w-full py-3 px-6 font-mono font-semibold text-[12px] tracking-[0.18em] uppercase cursor-pointer transition-colors disabled:opacity-40"
                            style={{ background: "var(--plasma)", color: "var(--ink)", border: "none" }}>
                            {!connected ? "Connect wallet →" : "Generate Touch ID credential"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Result + generated command */}
                    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                      <div className="px-6 py-[14px] border-b font-mono text-[12.5px]" style={{ borderColor: "var(--rule)", color: "var(--bone)" }}>Result</div>
                      <div className="p-6 flex flex-col gap-4">
                        <LastResult r={pkLast} />
                        {pkGenerated && (
                          <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--bone-4)" }}>Step 1 — add new Touch ID credential (run in terminal):</div>
                            <div className="border p-[12px] font-mono text-[10.5px] break-all select-all"
                                 style={{ borderColor: "rgba(198,255,58,0.25)", background: "rgba(198,255,58,0.03)", color: "var(--lime)" }}>
                              {`ANCHOR_WALLET=~/.config/solana/prefix1.json node scripts/add-passkey.mjs ${TRANA_GUARD_ID} ${pkGenerated.pubkeyHex} ${pkGenerated.credIdHex}`}
                            </div>
                            <button onClick={() => navigator.clipboard.writeText(`ANCHOR_WALLET=~/.config/solana/prefix1.json node scripts/add-passkey.mjs ${TRANA_GUARD_ID} ${pkGenerated.pubkeyHex} ${pkGenerated.credIdHex}`)}
                              className="self-start font-mono text-[11px] tracking-[0.12em] px-3 py-[6px] cursor-pointer"
                              style={{ border: "1px solid var(--rule-2)", color: "var(--bone-3)", background: "transparent" }}>
                              Copy step 1
                            </button>
                            <OldCredentialId connection={connection} publicKey={publicKey} guardId={TRANA_GUARD_ID} />
                          </div>
                        )}
                        <MetaRow k="Registry" v={publicKey ? shortAddr(getRegistryPda(publicKey).toBase58()) : "—"} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Secure a program form */}
                {route === "auth/programs" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-[18px] items-start">

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
                        <div className="flex items-center border mb-5 px-4 py-3" style={{ border: "1px solid var(--rule-2)", background: "var(--ink)" }}>
                          <span className="font-mono font-medium text-[11px] tracking-[0.18em] uppercase" style={{ color: "var(--plasma)" }}>
                            Program upgrade
                          </span>
                        </div>

                        <Label>Program ID</Label>
                        <div className="flex items-center gap-2 border px-4 py-3 mb-5" style={{ borderColor: "var(--rule-2)", background: "var(--ink)" }}>
                          <input
                            type="text"
                            value={authTarget}
                            onChange={e => setAuthTarget(e.target.value)}
                            placeholder="paste a program ID — e.g. TRAqCh…wsG"
                            className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[14px]"
                            style={{ color: "var(--bone)", caretColor: "var(--lime)" }}
                          />
                        </div>

                        <div className="grid gap-[10px_18px] border p-[14px] mb-5 font-mono text-[12.5px]"
                             style={{ gridTemplateColumns: "130px 1fr", borderColor: "var(--rule)", background: "var(--ink)" }}>
                          {[
                            ["Owner",          publicKey ? shortAddr(publicKey.toBase58()) : "connect wallet", !publicKey],
                            ["Authority kind", "ProgramUpgrade", false],
                            ["Derived PDA",    authPda ?? "— enter target —", !authPda],
                            ["Seeds",          '[ "trana-authority", owner, target ]', true],
                          ].map(([k, v, dim]) => (
                            <>
                              <span key={k + "k"} className="font-mono text-[10.5px] tracking-[0.18em] uppercase pt-[2px]" style={{ color: "var(--bone-3)" }}>{k as string}</span>
                              <span key={k + "v"} className="font-mono break-all text-[12px]" style={{ color: (dim as boolean) ? "var(--bone-3)" : "var(--bone)", fontSize: k === "Seeds" ? 11.5 : undefined }}>{v as string}</span>
                            </>
                          ))}
                        </div>

                        <ul className="flex flex-col mb-5">
                          <StepRow n={1} done    title="Register the AuthorityRecord PDA" sub="trana_authority::register(kind) · on-chain" />
                          <StepRow n={2} done={step2Done} cur={!step2Done} title="Transfer upgrade authority to the PDA" sub="solana program set-upgrade-authority <TARGET> --new-upgrade-authority <PDA>" />
                          <StepRow n={3} done={step3Done} title="Verify on-chain" sub="solana program show — confirms the PDA is the new authority" />
                        </ul>

                        <button
                          onClick={handleAuthSecure}
                          disabled={authBusy}
                          className="w-full py-4 px-6 font-mono font-semibold text-[13px] tracking-[0.18em] uppercase cursor-pointer transition-colors disabled:opacity-50"
                          style={{ background: "var(--plasma)", color: "var(--ink)", border: "none" }}
                        >
                          {authBusy ? "Securing…" : !connected ? "Connect wallet →" : "Secure this authority →"}
                        </button>

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

                    <div className="flex flex-col gap-[18px]" style={{ minWidth: 0 }}>
                      <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)" }}>
                        <div className="flex items-center justify-between px-6 py-[14px] border-b" style={{ borderColor: "var(--rule)" }}>
                          <div className="flex items-center gap-[10px]">
                            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-4)" }}>live</span>
                            <span className="font-mono text-[12.5px]" style={{ color: "var(--bone)" }}>Transaction receipt</span>
                          </div>
                          <span className="font-mono text-[11px]" style={{ color: "var(--bone-3)" }}>
                            slot <span style={{ color: "var(--bone)" }}>{slot !== null ? slot.toLocaleString("en-US") : "…"}</span>
                          </span>
                        </div>
                        <div className="px-6 py-4">
                          {[
                            { k: "ix[0]", v: "trana_authority::register",          c: "var(--lime)" },
                            { k: "ix[1]", v: "bpf_loader::set_upgrade_authority", c: "var(--plasma)" },
                            { k: "Status", v: authStatus ?? "awaiting submit",     c: authStatus === "confirmed" ? "var(--lime)" : authStatus === "submitting…" ? "var(--bone-2)" : "var(--bone-3)" },
                          ].map(row => <MetaRow key={row.k} k={row.k} v={row.v} color={row.c} />)}
                          {amTxsig && (
                            <div className="flex items-center justify-between py-[11px] border-b font-mono text-[12.5px]" style={{ borderColor: "var(--rule)" }}>
                              <span className="font-medium text-[10.5px] tracking-[0.18em] uppercase" style={{ color: "var(--bone-3)" }}>Tx sig</span>
                              <a href={`https://solscan.io/tx/${amTxsig}?cluster=devnet`} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center gap-1 transition-opacity hover:opacity-80"
                                 style={{ color: "var(--azure)" }}>
                                {shortSig(amTxsig)} <span style={{ fontSize: 9, letterSpacing: "0.16em" }}>↗</span>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

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
                    {!connected ? (
                      <div className="px-[18px] py-[18px] font-mono text-[12.5px]" style={{ color: "var(--bone-3)" }}>
                        Connect your wallet to see secured authorities.
                      </div>
                    ) : (
                      <div className="px-[18px] py-[18px] font-mono text-[12.5px]" style={{ color: "var(--bone-3)" }}>
                        No secured authorities found for{" "}
                        <span style={{ color: "var(--bone)" }}>{publicKey ? shortAddr(publicKey.toBase58()) : "—"}</span>
                        {" "}on devnet.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavItem({ item, active, auth, disabled, onClick }: {
  item: typeof NAV_ITEMS[number]; active: boolean; auth?: boolean
  disabled?: boolean; onClick?: () => void
}) {
  const accent   = auth ? "var(--plasma)" : "var(--lime)"
  const accentBg = auth ? "rgba(255,91,31,0.05)" : "rgba(198,255,58,0.05)"
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="flex items-center gap-[10px] py-[9px] px-[14px] font-mono text-[12.5px] text-left w-full transition-colors"
      style={{
        background: active ? accentBg : "transparent",
        color: disabled ? "var(--bone-5)" : active ? accent : "var(--bone-3)",
        boxShadow: active ? `inset 0 -1.5px 0 0 ${accent}` : "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span className="font-mono text-[10px] w-[18px] tracking-[0.04em] shrink-0"
            style={{ color: active ? accent : "var(--bone-5)" }}>
        {item.ix}
      </span>
      <span>{item.label}</span>
      {disabled && <span className="ml-auto font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "var(--bone-5)" }}>soon</span>}
    </button>
  )
}

function Panel({ dot, title, subtitle, policyLabel, policyColor, children }: {
  dot: "lime" | "plasma"; title: string; subtitle: string
  policyLabel: string; policyColor: string; children: React.ReactNode
}) {
  return (
    <div className="border" style={{ borderColor: "var(--rule-2)", background: "var(--ink-2)", display: "grid", gridTemplateColumns: "1fr" }}>
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
      style={{ background: over ? "var(--plasma)" : "var(--lime)", color: "var(--ink)", border: "none" }}
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
           background:  ok ? "rgba(198,255,58,0.04)" : "rgba(255,91,31,0.04)",
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
              background:  done ? "rgba(198,255,58,0.06)" : cur ? "rgba(255,91,31,0.06)" : "transparent",
              color:       done ? "var(--lime)"           : cur ? "var(--plasma)"         : "var(--bone-3)",
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

// ── OldCredentialId — shows remove command for CLI-registered cred ────────────

function OldCredentialId({ connection, publicKey, guardId }: {
  connection: import("@solana/web3.js").Connection
  publicKey: PublicKey | null
  guardId: string
}) {
  const [credHex, setCredHex] = useState<string | null>(null)
  useEffect(() => {
    if (!publicKey) return
    import("@/lib/vault").then(({ fetchFirstPasskey }) =>
      fetchFirstPasskey(connection, publicKey).then(p => {
        if (p) setCredHex(Array.from(p.credentialId).map(b => b.toString(16).padStart(2, "0")).join(""))
      })
    )
  }, [connection, publicKey])
  if (!credHex) return null
  const cmd = `ANCHOR_WALLET=~/.config/solana/prefix1.json node scripts/remove-passkey.mjs ${guardId} ${credHex}`
  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="font-mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--bone-4)" }}>Step 2 — remove old CLI credential:</div>
      <div className="border p-[12px] font-mono text-[10.5px] break-all select-all"
           style={{ borderColor: "rgba(255,91,31,0.25)", background: "rgba(255,91,31,0.03)", color: "var(--plasma)" }}>
        {cmd}
      </div>
      <button onClick={() => navigator.clipboard.writeText(cmd)}
        className="self-start font-mono text-[11px] tracking-[0.12em] px-3 py-[6px] cursor-pointer"
        style={{ border: "1px solid var(--rule-2)", color: "var(--bone-3)", background: "transparent" }}>
        Copy step 2
      </button>
      <div className="font-mono text-[11px]" style={{ color: "var(--bone-4)" }}>
        After both commands: browser will show Touch ID instead of QR for this wallet.
      </div>
    </div>
  )
}

// ── PolicyStatus ─────────────────────────────────────────────────────────────

function PolicyStatus({ deposit, slot }: { deposit: UserDepositState | null; slot: number | null }) {
  if (!deposit?.exists) {
    return (
      <div className="flex flex-col gap-[6px] mt-2 font-mono text-[12px]" style={{ color: "var(--bone-3)" }}>
        <span>Connect wallet and deposit to see live policy state.</span>
      </div>
    )
  }

  const nowSec     = Math.floor(Date.now() / 1000)
  const inWindow   = deposit.lastWithdrawAt > 0n && (BigInt(nowSec) - deposit.lastWithdrawAt) < BigInt(DRAIN_WINDOW_SEC)
  const winSol     = Number(deposit.windowWithdrawn) / 1e9
  const limitSol   = Number(WITHDRAW_LIMIT) / 1e9
  const isBurst    = inWindow && deposit.windowWithdrawn >= WITHDRAW_LIMIT
  const unlockSlot = deposit.lastWithdrawSlot + COOLDOWN_SLOTS
  const slotsLeft  = slot !== null && isBurst ? Math.max(0, Number(unlockSlot) - slot) : 0
  const secsLeft   = Math.ceil(slotsLeft * 0.4)
  const winSecsLeft = inWindow ? Math.max(0, DRAIN_WINDOW_SEC - (nowSec - Number(deposit.lastWithdrawAt))) : 0

  type Row = { label: string; value: string; accent?: string }
  const rows: Row[] = []

  if (isBurst) {
    rows.push({ label: "policy",   value: "trana.not_before",  accent: "var(--plasma)" })
    rows.push({ label: "condition", value: `slot ≥ ${unlockSlot.toString()}` })
    rows.push({ label: "current",  value: slot !== null ? `slot ${slot.toLocaleString()}` : "…" })
    rows.push({ label: "passkey required until", value: slotsLeft > 0 ? `~${secsLeft}s (${slotsLeft} slots)` : "ready — sign now", accent: slotsLeft > 0 ? "var(--plasma)" : "var(--lime)" })
  } else {
    rows.push({ label: "policy",    value: "trana.limit",       accent: "var(--lime)" })
    rows.push({ label: "threshold", value: `${limitSol} SOL per tx` })
    rows.push({ label: "window",    value: inWindow ? `${winSol.toFixed(3)} / ${limitSol} SOL` : "fresh (no active window)" })
    if (inWindow) rows.push({ label: "window resets", value: `~${winSecsLeft}s` })
  }

  // Fill bar
  const fillPct = isBurst ? 100 : Math.min(100, (winSol / limitSol) * 100)
  const fillColor = isBurst ? "var(--plasma)" : winSol / limitSol > 0.7 ? "rgba(255,91,31,0.7)" : "var(--lime)"

  return (
    <div className="flex flex-col gap-0 mt-2">
      <div className="h-[3px] w-full mb-3" style={{ background: "var(--rule-2)" }}>
        <div className="h-full transition-all" style={{ width: `${fillPct}%`, background: fillColor }} />
      </div>
      {rows.map(r => (
        <div key={r.label} className="flex items-start justify-between py-[8px] border-b font-mono text-[11.5px]"
             style={{ borderColor: "var(--rule)" }}>
          <span className="text-[10px] tracking-[0.16em] uppercase" style={{ color: "var(--bone-4)" }}>{r.label}</span>
          <span className="text-right ml-2" style={{ color: r.accent ?? "var(--bone-2)" }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const svgBase = "fill-none stroke-current"
function ClockIcon()    { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> }
function CheckIcon()    { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><path d="m5 12 5 5 9-9"/></svg> }
function WarnIcon()     { return <svg className={`${svgBase} w-[13px] h-[13px] shrink-0 mt-[1px]`} viewBox="0 0 24 24" strokeWidth="1.6"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18v.5"/></svg> }
function KeyIcon()      { return <svg className={`${svgBase} w-[12px] h-[12px]`} viewBox="0 0 24 24" strokeWidth="1.6"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function DepositIcon()  { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></svg> }
function WithdrawIcon() { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M12 20V8M6 12l6-6 6 6M4 4h16"/></svg> }
function UpgradeIcon()  { return <svg className={`${svgBase} w-[22px] h-[22px]`} viewBox="0 0 24 24" strokeWidth="1.5"><path d="M4 6h6M4 12h12M4 18h8"/><circle cx="18" cy="6" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg> }
