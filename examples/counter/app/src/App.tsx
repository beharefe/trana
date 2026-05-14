import { useState, useEffect, useCallback } from "react"
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { TranaGuardClient, Policy } from "@tranaprotocol/sdk"
import { getWallets, getActiveIndex, setActiveIndex, addWallet, ensureFunded } from "./wallet"
import { fetchCounter, initializeIx, incrementIx, type CounterAccount } from "./counter"

const connection = new Connection("http://127.0.0.1:8899", "confirmed")

export default function App() {
  const [wallets,    setWallets]    = useState<Keypair[]>(() => getWallets())
  const [activeIdx,  setActiveIdx]  = useState<number>(() => getActiveIndex())
  const [counter,    setCounter]    = useState<CounterAccount | null | "loading">("loading")
  const [registered, setRegistered] = useState(false)
  const [handle,     setHandle]     = useState<{ credentialId: Uint8Array } | null>(null)
  const [status,     setStatus]     = useState("")
  const [busy,       setBusy]       = useState(false)
  const [logsMap,    setLogsMap]    = useState<Record<string, string[]>>({})

  const keypair = wallets[activeIdx]
  const client  = new TranaGuardClient({ connection, cluster: "localnet" })

  const handleKey = `trana:${keypair.publicKey.toBase58()}`

  const reload = useCallback(async (kp: Keypair = keypair) => {
    const key = `trana:${kp.publicKey.toBase58()}`
    const cl  = new TranaGuardClient({ connection, cluster: "localnet" })
    const [c, registry] = await Promise.all([
      fetchCounter(connection, kp.publicKey),
      cl.fetchRegistry(kp.publicKey),
    ])
    setCounter(c)
    setRegistered(registry !== null)
    const stored = localStorage.getItem(key)
    if (registry !== null && stored) {
      setHandle({ credentialId: Uint8Array.from(JSON.parse(stored).credentialId) })
    } else {
      if (registry === null) localStorage.removeItem(key)
      setHandle(null)
    }
  }, [activeIdx])

  // Reload + fund when active wallet changes
  useEffect(() => {
    setCounter("loading")
    setStatus("Funding wallet…")
    ensureFunded(connection, keypair.publicKey)
      .then(() => { setStatus(""); return reload(keypair) })
      .catch(e => setStatus(`Validator not reachable: ${e.message}`))
  }, [activeIdx])

  const switchWallet = (idx: number) => {
    setActiveIndex(idx)
    setActiveIdx(idx)
  }

  const newWallet = async () => {
    const idx = addWallet()
    const updated = getWallets()
    setWallets(updated)
    switchWallet(idx)
  }

  const sign = useCallback(async (tx: Transaction): Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer        = keypair.publicKey
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed", skipPreflight: true,
    })
    const info = await connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    const pk = keypair.publicKey.toBase58()
    setLogsMap(prev => ({ ...prev, [pk]: info?.meta?.logMessages ?? [] }))
    return sig
  }, [keypair])

  const registerPasskey = useCallback(async () => {
    setBusy(true); setStatus("Touch your authenticator…")
    try {
      const { instruction, handle: h } = await client.registerPasskey({
        owner:           keypair.publicKey,
        rpId:            window.location.hostname,
        userDisplayName: keypair.publicKey.toBase58().slice(0, 8),
      })
      await sign(new Transaction().add(instruction))
      const entry = { credentialId: Array.from(h.credentialId) }
      localStorage.setItem(handleKey, JSON.stringify(entry))
      setHandle({ credentialId: h.credentialId })
      setRegistered(true)
      setStatus("Passkey registered.")
    } catch (e: any) { setStatus(`Error: ${e.message}`) }
    finally { setBusy(false) }
  }, [keypair, sign, handleKey])

  const initCounter = useCallback(async () => {
    setBusy(true); setStatus("Initializing…")
    try {
      await sign(new Transaction().add(initializeIx(keypair.publicKey)))
      await reload()
      setStatus("Counter created.")
    } catch (e: any) { setStatus(`Error: ${e.message}`) }
    finally { setBusy(false) }
  }, [keypair, sign, reload])

  const increment = useCallback(async () => {
    if (!handle) { await registerPasskey(); return }
    setBusy(true); setStatus("Touch your passkey…")
    try {
      const ix = incrementIx(keypair.publicKey)
      const { secp256r1Ix, recordProofIx } = await client.buildProof({
        protectedIx:  ix,
        owner:        keypair.publicKey,
        credentialId: handle.credentialId,
        policy:       Policy.Require(),
        rpId:         window.location.hostname,
      })
      await sign(new Transaction().add(secp256r1Ix, recordProofIx, ix))
      await reload()
      setStatus("Incremented ✓")
    } catch (e: any) {
      const needsReg = e.message?.includes("MissingProof")
        || e.message?.includes("6000")
        || e.message?.includes("Registry not found")
        || e.message?.includes("RegistryRequired")
      if (needsReg) {
        localStorage.removeItem(handleKey)
        setHandle(null)
        setStatus("No passkey found — registering…")
        await registerPasskey()
      } else {
        setStatus(`Error: ${e.message}`)
      }
    }
    finally { setBusy(false) }
  }, [keypair, handle, sign, reload, registerPasskey, handleKey])

  return (
    <div style={s.page}>
      <h1 style={s.title}>Trana Counter</h1>

      {/* Wallet selector */}
      <div style={s.walletRow}>
        {wallets.map((w, i) => (
          <button
            key={w.publicKey.toBase58()}
            style={{ ...s.walletBtn, ...(i === activeIdx ? s.walletBtnActive : {}) }}
            onClick={() => switchWallet(i)}
            disabled={busy}
          >
            <span style={s.walletNum}>Wallet {i + 1}</span>
            <span style={s.walletAddr}>{w.publicKey.toBase58().slice(0, 8)}…</span>
          </button>
        ))}
        <button style={s.addBtn} onClick={newWallet} disabled={busy}>+ New Wallet</button>
      </div>

      {/* Active wallet pubkey */}
      <p style={s.addr}>{keypair.publicKey.toBase58()}</p>

      {/* Counter */}
      {counter === "loading" ? (
        <p style={s.status}>Loading…</p>
      ) : counter === null ? (
        <button style={s.btn} onClick={initCounter} disabled={busy}>Initialize Counter</button>
      ) : (
        <>
          <p style={s.count}>{counter.count.toString()}</p>
          <button style={s.btn} onClick={increment} disabled={busy}>
            {!registered || !handle ? "Register Passkey & Increment" : "Increment"}
          </button>
        </>
      )}

      {status && <p style={s.status}>{status}</p>}

      {(logsMap[keypair.publicKey.toBase58()] ?? []).length > 0 && (
        <div style={s.logs}>
          <p style={s.logsTitle}>Transaction logs</p>
          {(logsMap[keypair.publicKey.toBase58()] ?? []).map((line, i) => (
            <p key={i} style={{
              ...s.logLine,
              ...(line.includes("Program log:") ? s.logHighlight : {}),
              ...(line.includes("success") ? s.logSuccess : {}),
              ...(line.includes("failed") || line.includes("error") ? s.logError : {}),
            }}>{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:          { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 40, fontFamily: "system-ui, sans-serif" },
  title:         { margin: 0, fontSize: 28 },
  walletRow:     { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  walletBtn:     { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", borderRadius: 8, border: "2px solid #e0e0e0", background: "white", cursor: "pointer", gap: 2 },
  walletBtnActive: { borderColor: "#512da8", background: "#f3f0ff" },
  walletNum:     { fontSize: 11, fontWeight: 600, color: "#512da8" },
  walletAddr:    { fontSize: 11, fontFamily: "monospace", color: "#666" },
  addBtn:        { padding: "8px 14px", borderRadius: 8, border: "2px dashed #ccc", background: "white", cursor: "pointer", fontSize: 13, color: "#888" },
  addr:          { color: "#aaa", fontSize: 11, fontFamily: "monospace", margin: 0 },
  count:         { fontSize: 96, fontWeight: 700, margin: 0, lineHeight: 1 },
  btn:           { padding: "12px 28px", fontSize: 16, borderRadius: 8, border: "none", background: "#512da8", color: "#fff", cursor: "pointer" },
  status:        { color: "#888", fontSize: 13, margin: 0 },
  logs:          { width: "100%", maxWidth: 680, background: "#0d1117", borderRadius: 8, padding: "12px 16px", marginTop: 8 },
  logsTitle:     { color: "#666", fontSize: 11, fontFamily: "monospace", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 },
  logLine:       { margin: "2px 0", fontSize: 11, fontFamily: "monospace", color: "#8b949e", whiteSpace: "pre-wrap", wordBreak: "break-all" },
  logHighlight:  { color: "#c9d1d9" },
  logSuccess:    { color: "#3fb950" },
  logError:      { color: "#f85149" },
}
