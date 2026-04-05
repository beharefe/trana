interface CodeBlockProps {
  children: string
  language?: string
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  return (
    <div className="relative group">
      {language && (
        <span className="absolute top-3 right-4 text-xs text-gray-600 font-mono select-none">
          {language}
        </span>
      )}
      <pre className="bg-zinc-900 border border-white/5 p-5 rounded-xl text-sm text-left font-mono leading-relaxed text-gray-300 overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  )
}
