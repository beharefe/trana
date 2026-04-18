"use client"

interface Props {
  onTxSuccess: (sig: string, label: string) => void
  onTxError:   (err: unknown, label: string) => void
}

export function VaultPanel({ onTxSuccess, onTxError }: Props) {
  return (
    <section className="border border-gray-800 rounded-lg p-5 bg-gray-900/20">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Vault
      </h2>
      <p className="text-xs text-gray-600 italic">VaultPanel — coming soon</p>
    </section>
  )
}
