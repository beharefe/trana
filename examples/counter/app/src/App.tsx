import { useState, useEffect, useCallback } from "react"
import { useWallet, useConnection } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Transaction } from "@solana/web3.js"
import { TranaGuardClient, Policy } from "@tranaprotocol/sdk"
import {
  counterPda, fetchCounter, initializeIx, incrementIx,
  type CounterAccount,
} from "./counter"

type Handle = { credentialId: Uint8Array }

export default function App() {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()

  const [counter, setCounter] = useState<CounterAccount | null | "loading">("loading")
  const [registered, setRegistered] = useState(false)
  const [handle, setHandle]         = useState<Handle | null>(null)
  const [status, setStatus]         = useState("")
  const [busy, setBusy]             = useState(false)

  const client = publicKey
    ? new TranaGuardClient({ connection, cluster: "localnet" })
    : null

  // Reload counter + registry state whenever wallet changes
  useEffect(() => {
    if (!publicKey || !client) { setCounter("loading"); return }

    Promise.all([
      fetchCounter(connection, publicKey),
      client.fetchRegistry(publicKey),
    ]).then(([c, registry]) => {
      setCounter(c)
      setRegistered(registry !== null)
    })

    const stored = localStorage.getItem(`trana:${publicKey.toBase58()}`)
    if (stored) {
      const { credentialId } = JSON.parse(stored)
      setHandle({ credentialId: Uint8Array.from(credentialId) })
    } else {
      setHandle(null)
    }
  }, [publicKey?.toBase58()])

  const registerPasskey = useCallback(async () => {
    if (!publicKey || !client) return
    setBusy(true); setStatus("Touch your authenticator to register…")
    try {
      const { instruction, handle: h } = await client.registerPasskey({
        owner:           publicKey,
        rpId:            window.location.hostname,
        userDisplayName: publicKey.toBase58().slice(0, 8),
      })
      const sig = await sendTransaction(new Transaction().add(instruction), connection)
      await connection.confirmTransaction(sig, "confirmed")
      const entry = { credentialId: Array.from(h.credentialId) }
      localStorage.setItem(`trana:${publicKey.toBase58()}`, JSON.stringify(entry))
      setHandle({ credentialId: h.credentialId })
      setRegistered(true)
      setStatus("Passkey registered.")
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [publicKey, client, sendTransaction, connection])

  const initCounter = useCallback(async () => {
    if (!publicKey) return
    setBusy(true); setStatus("Initializing…")
    try {
      const sig = await sendTransaction(
        new Transaction().add(initializeIx(publicKey)),
        connection,
      )
      await connection.confirmTransaction(sig, "confirmed")
      setCounter(await fetchCounter(connection, publicKey))
      setStatus("Counter created.")
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [publicKey, sendTransaction, connection])

  const increment = useCallback(async () => {
    if (!publicKey || !client || !handle) return
    setBusy(true); setStatus("Touch your passkey…")
    try {
      const ix = incrementIx(publicKey)
      const { secp256r1Ix, recordProofIx } = await client.buildProof({
        protectedIx:  ix,
        owner:        publicKey,
        credentialId: handle.credentialId,
        policy:       Policy.Require(),
        rpId:         window.location.hostname,
      })
      const sig = await sendTransaction(
        new Transaction().add(secp256r1Ix, recordProofIx, ix),
        connection,
      )
      await connection.confirmTransaction(sig, "confirmed")
      setCounter(await fetchCounter(connection, publicKey))
      setStatus("Incremented ✓")
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [publicKey, client, handle, sendTransaction, connection])

  if (!publicKey) {
    return (
      <div style={s.page}>
        <h1 style={s.title}>Trana Counter</h1>
        <p style={s.sub}>Every increment requires a passkey touch.</p>
        <WalletMultiButton />
      </div>
    )
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Trana Counter</h1>
      <WalletMultiButton />

      {counter === "loading" ? (
        <p>Loading…</p>
      ) : counter === null ? (
        <button style={s.btn} onClick={initCounter} disabled={busy}>
          Initialize Counter
        </button>
      ) : (
        <>
          <p style={s.count}>{counter.count.toString()}</p>

          {!registered ? (
            <button style={s.btn} onClick={registerPasskey} disabled={busy}>
              Register Passkey
            </button>
          ) : !handle ? (
            <p>
              Passkey registered on another device.{" "}
              <button style={s.link} onClick={registerPasskey} disabled={busy}>
                Re-register here
              </button>
            </p>
          ) : (
            <button style={s.btn} onClick={increment} disabled={busy}>
              Increment
            </button>
          )}
        </>
      )}

      {status && <p style={s.status}>{status}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:   { display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: 48, fontFamily: "system-ui, sans-serif" },
  title:  { margin: 0, fontSize: 28 },
  sub:    { color: "#666", margin: 0 },
  count:  { fontSize: 96, fontWeight: 700, margin: 0, lineHeight: 1 },
  btn:    { padding: "12px 28px", fontSize: 16, borderRadius: 8, border: "none", background: "#512da8", color: "#fff", cursor: "pointer" },
  link:   { background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" },
  status: { color: "#888", fontSize: 13 },
}
