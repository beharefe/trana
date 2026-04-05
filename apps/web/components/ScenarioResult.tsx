"use client"

interface Props {
  result: {
    ok: boolean
    label: string
    description: string
    txSig?: string
    error?: string
  } | null
}

export function ScenarioResult({ result }: Props) {
  if (!result) return null

  return (
    <div
      className={`mt-4 p-4 rounded border font-mono text-sm ${
        result.ok
          ? "bg-green-900/20 border-green-800 text-green-300"
          : "bg-red-900/20 border-red-800 text-red-300"
      }`}
    >
      <div className="flex items-center gap-2 font-bold mb-1">
        <span>{result.ok ? "✅" : "❌"}</span>
        <span>{result.label}</span>
      </div>
      <p className="text-xs opacity-80 mb-2">{result.description}</p>

      {result.txSig && (
        <a
          href={`https://solscan.io/tx/${result.txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-400 hover:underline"
        >
          View on Solscan →
        </a>
      )}

      {result.error && (
        <pre className="text-xs text-red-400/80 mt-2 whitespace-pre-wrap break-all">
          {result.error}
        </pre>
      )}
    </div>
  )
}
