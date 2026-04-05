"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Props {
  wallet: string | null
}

interface Status {
  has_passkey: boolean
  opt_in: boolean
}

export function PasskeyStatus({ wallet }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!wallet) {
      setStatus(null)
      return
    }
    setLoading(true)
    fetch(`/api/status?wallet=${encodeURIComponent(wallet)}`)
      .then((r) => r.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ has_passkey: false, opt_in: false }))
      .finally(() => setLoading(false))
  }, [wallet])

  if (!wallet) return null
  if (loading) return <span className="text-xs text-gray-500">Checking passkey...</span>
  if (!status) return null

  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono ${
          status.has_passkey
            ? "bg-green-900/40 text-green-400 border border-green-800"
            : "bg-gray-800 text-gray-400 border border-gray-700"
        }`}
      >
        <span>{status.has_passkey ? "🔐" : "🔓"}</span>
        {status.has_passkey ? "Passkey registered" : "No passkey"}
      </span>

      {!status.has_passkey && (
        <Link
          href={`/register?wallet=${wallet}`}
          className="text-xs text-indigo-400 hover:text-indigo-300 underline"
        >
          Register passkey →
        </Link>
      )}

      {status.has_passkey && status.opt_in && (
        <span className="text-xs text-yellow-500/80">(opt-in active)</span>
      )}
    </div>
  )
}
