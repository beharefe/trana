"use client"

export interface TxEntry {
  id:    string
  ok:    boolean
  label: string
  sig?:  string
  ts:    number
}

export function TxFeed({ entries }: { entries: TxEntry[] }) {
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-2 text-xs border border-gray-800 rounded px-3 py-2 bg-gray-900/30"
        >
          <span className={e.ok ? "text-green-400" : "text-red-400"}>
            {e.ok ? "✓" : "✗"}
          </span>
          <span className="text-gray-300 flex-1">{e.label}</span>
          {e.sig && (
            <span className="text-gray-600 font-mono truncate max-w-[120px]">
              {e.sig.slice(0, 8)}…
            </span>
          )}
          <span className="text-gray-700">{new Date(e.ts).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  )
}
