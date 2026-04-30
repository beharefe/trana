"use client"

import { useState } from "react"
import { SandpackProvider, SandpackCodeViewer } from "@codesandbox/sandpack-react"

const LANG_TO_EXT: Record<string, string> = {
  rust:       "rs",
  toml:       "toml",
  typescript: "ts",
  javascript: "js",
  ts:         "ts",
  js:         "js",
  jsx:        "jsx",
  tsx:        "tsx",
  html:       "html",
  css:        "css",
  json:       "json",
  bash:       "sh",
  shell:      "sh",
  sh:         "sh",
}

const theme = {
  colors: {
    surface1:     "#0d0e11",
    surface2:     "#13141a",
    surface3:     "#1a1b22",
    clickable:    "#6c7280",
    base:         "#e2e8f0",
    disabled:     "#4b5563",
    hover:        "#f4f4f5",
    accent:       "#7af0a8",
    error:        "#ff5560",
    errorSurface: "#1a0a0a",
  },
  syntax: {
    plain:       "#e2e8f0",
    comment:     { color: "#6c7280", fontStyle: "italic" as const },
    keyword:     "#b794ff",
    tag:         "#7af0a8",
    punctuation: "#94a3b8",
    definition:  "#7aa8ff",
    property:    "#7af0a8",
    static:      "#f3d77a",
    string:      "#ff7a59",
  },
  font: {
    body:       "var(--font-inter), system-ui, sans-serif",
    mono:       "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    size:       "13.5px",
    lineHeight: "1.65",
  },
}

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const ext      = LANG_TO_EXT[language] ?? "txt"
  const filename = `/code.${ext}`

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative my-6 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.08)] group">
      {language && language !== "text" && language !== "plaintext" && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)] z-10">
          <span className="text-[11px] font-mono text-faint uppercase tracking-wider">{language}</span>
          <button
            onClick={handleCopy}
            className="text-[11px] font-mono text-faint hover:text-ink transition-colors px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)]"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      {(!language || language === "text" || language === "plaintext") && (
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 z-10 text-[11px] font-mono text-faint hover:text-ink transition-all px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] opacity-0 group-hover:opacity-100"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      )}
      <div className={language && language !== "text" && language !== "plaintext" ? "pt-10" : ""}>
        <SandpackProvider
          files={{ [filename]: { code, readOnly: true } }}
          theme={theme}
          options={{ activeFile: filename }}
        >
          <SandpackCodeViewer showLineNumbers={false} />
        </SandpackProvider>
      </div>
    </div>
  )
}
