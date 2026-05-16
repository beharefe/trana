"use client"
import { useEffect, useRef } from "react"

let initialized = false

interface Props { chart: string }

export function Mermaid({ chart }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    let cancelled = false

    import("mermaid").then(({ default: mermaid }) => {
      if (!initialized) {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          darkMode: true,
          themeVariables: {
            background: "transparent",
            mainBkg: "#0d0d12",
            nodeBorder: "rgba(255,255,255,0.12)",
            clusterBkg: "rgba(255,255,255,0.04)",
            titleColor: "#e5e5e5",
            nodeTextColor: "#e5e5e5",
            edgeLabelBackground: "#0d0d12",
            lineColor: "rgba(255,255,255,0.3)",
          },
          flowchart: { curve: "basis", htmlLabels: true },
        })
        initialized = true
      }
      const id = `mermaid-${Math.random().toString(36).slice(2)}`
      mermaid.render(id, chart).then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      })
    })

    return () => { cancelled = true }
  }, [chart])

  return (
    <div
      ref={ref}
      className="my-8 flex justify-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
    />
  )
}
