interface CodeBlockProps {
  children: string
  language?: string
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  return (
    <div className="relative">
      {language && (
        <span className="absolute top-3 right-4 text-xs text-faint font-mono select-none">
          {language}
        </span>
      )}
      <pre className="bg-[#1C1917] border border-[#2C2825] p-5 rounded-xl text-sm text-left font-mono leading-relaxed text-[#D6D0C8] overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  )
}
