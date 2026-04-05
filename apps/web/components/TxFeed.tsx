"use client"

export interface TxEntry {
  id:      string
  ok:      boolean
  label:   string
  sig?:    string
  ts:      number
}

interface Props {
  entries: TxEntry[]
}

export function TxFeed({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className={`flex items-start gap-3 p-3 rounded border text-xs font-mono ${
            e.ok
              ? "bg-green-900/15 border-green-900/40 text-green-300"
              : "bg-red-900/15 border-red-900/40 text-red-300"
          }`}
        >
          <span className="mt-0.5">{e.ok ? "✅" : "❌"}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{e.label}</div>
            {e.sig && (
              <a
                href={`https://solscan.io/tx/${e.sig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline text-[11px] block truncate"
              >
                {e.sig.slice(0, 20)}… →
              </a>
            )}
          </div>
          <span className="text-gray-600 shrink-0">
            {new Date(e.ts).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  )
}
