"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Props {
  wallet:    string | null
  serverUrl: string
}

interface Status {
  has_passkey: boolean
  opt_in:      boolean
}

export function PasskeyStatus({ wallet, serverUrl }: Props) {
  const [status,  setStatus]  = useState<Status | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!wallet) { setStatus(null); return }
    setLoading(true)
    fetch(`${serverUrl}/api/status?wallet=${encodeURIComponent(wallet)}`)
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => setStatus({ has_passkey: false, opt_in: false }))
      .finally(() => setLoading(false))
  }, [wallet, serverUrl])

  if (!wallet || loading) return null

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border ${
        status?.has_passkey
          ? "bg-green-900/30 text-green-400 border-green-800"
          : "bg-gray-800 text-gray-500 border-gray-700"
      }`}>
        {status?.has_passkey ? "🔐 Passkey" : "🔓 No passkey"}
      </span>

      {!status?.has_passkey && (
        <Link
          href={`/register?wallet=${wallet}`}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
        >
          Register →
        </Link>
      )}
    </div>
  )
}
