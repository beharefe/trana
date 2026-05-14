import { useState, useEffect, useCallback } from "react"
import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { TranaGuardClient, Policy } from "@tranaprotocol/sdk"
import { getOrCreateKeypair, ensureFunded } from "./wallet"
import { fetchCounter, initializeIx, incrementIx, type CounterAccount } from "./counter"

const connection = new Connection("http://127.0.0.1:8899", "confirmed")

export default function App() {
  const [keypair]    = useState(() => getOrCreateKeypair())
  const [counter,    setCounter]    = useState<CounterAccount | null | "loading">("loading")
  const [registered, setRegistered] = useState(false)
  const [handle,     setHandle]     = useState<{ credentialId: Uint8Array } | null>(null)
  const [status,     setStatus]     = useState("")
  const [busy,       setBusy]       = useState(false)
  const [logs,       setLogs]       = useState<string[]>([])

  const client = new TranaGuardClient({ connection, cluster: "localnet" })

  const reload = useCallback(async () => {
    const [c, registry] = await Promise.all([
      fetchCounter(connection, keypair.publicKey),
      client.fetchRegistry(keypair.publicKey),
    ])
    setCounter(c)
    setRegistered(registry !== null)
    const stored = localStorage.getItem(`trana:${keypair.publicKey.toBase58()}`)
    if (stored) setHandle({ credentialId: Uint8Array.from(JSON.parse(stored).credentialId) })
  }, [keypair.publicKey.toBase58()])

  useEffect(() => {
    setStatus("Funding local wallet…")
    ensureFunded(connection, keypair.publicKey)
      .then(() => { setStatus(""); return reload() })
      .catch(e => setStatus(`Validator not reachable: ${e.message}`))
  }, [])

  const sign = useCallback(async (tx: Transaction): Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer        = keypair.publicKey
    // skipPreflight: secp256r1 is a native precompile — RPC simulation can't resolve
    // it as a program account even when the feature gate is active. Execution works.
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed", skipPreflight: true,
    })
    // Fetch and display transaction logs
    const info = await connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    setLogs(info?.meta?.logMessages ?? [])
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
      localStorage.setItem(`trana:${keypair.publicKey.toBase58()}`, JSON.stringify(entry))
      setHandle({ credentialId: h.credentialId })
      setRegistered(true)
      setStatus("Passkey registered.")
    } catch (e: any) { setStatus(`Error: ${e.message}`) }
    finally { setBusy(false) }
  }, [keypair, sign])

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
      if (e.message?.includes("MissingProof") || e.message?.includes("6000")) {
        setStatus("No passkey found — registering…")
        await registerPasskey()
      } else {
        setStatus(`Error: ${e.message}`)
      }
    }
    finally { setBusy(false) }
  }, [keypair, handle, sign, reload, registerPasskey])

  return (
    <div style={s.page}>
      <h1 style={s.title}>Trana Counter</h1>
      <p style={s.addr}>{keypair.publicKey.toBase58().slice(0, 20)}…</p>

      {counter === "loading" ? (
        <p>Loading…</p>
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

      {logs.length > 0 && (
        <div style={s.logs}>
          <p style={s.logsTitle}>Transaction logs</p>
          {logs.map((line, i) => (
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
  page:        { display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: 48, fontFamily: "system-ui, sans-serif" },
  title:       { margin: 0, fontSize: 28 },
  addr:        { color: "#aaa", fontSize: 12, fontFamily: "monospace", margin: 0 },
  count:       { fontSize: 96, fontWeight: 700, margin: 0, lineHeight: 1 },
  btn:         { padding: "12px 28px", fontSize: 16, borderRadius: 8, border: "none", background: "#512da8", color: "#fff", cursor: "pointer" },
  status:      { color: "#888", fontSize: 13 },
  logs:        { width: "100%", maxWidth: 680, background: "#0d1117", borderRadius: 8, padding: "12px 16px", marginTop: 8 },
  logsTitle:   { color: "#666", fontSize: 11, fontFamily: "monospace", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 },
  logLine:     { margin: "2px 0", fontSize: 11, fontFamily: "monospace", color: "#8b949e", whiteSpace: "pre-wrap", wordBreak: "break-all" },
  logHighlight:{ color: "#c9d1d9" },
  logSuccess:  { color: "#3fb950" },
  logError:    { color: "#f85149" },
}
