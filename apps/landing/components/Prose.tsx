import type { ReactNode } from "react"

export function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`max-w-2xl mx-auto w-full ${className}`}>
      {children}
    </div>
  )
}
