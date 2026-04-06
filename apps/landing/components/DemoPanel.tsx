"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AnimatedFlow } from "./AnimatedFlow"

type State = "idle" | "failed" | "success"

export function DemoPanel() {
  const [state, setState] = useState<State>("idle")
  const [loading, setLoading] = useState(false)

  async function simulate() {
    setLoading(true)
    setState("idle")
    await delay(800)
    setState("failed")
    setLoading(false)
  }

  async function approve() {
    setLoading(true)
    setState("idle")
    await delay(600)
    setState("success")
    setLoading(false)
  }

  function reset() {
    setState("idle")
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 space-y-8">
      <div>
        <p className="text-xs text-faint font-mono uppercase tracking-widest mb-2">
          Attack simulation
        </p>
        <h3 className="text-xl font-medium text-ink">
          See what happens when a key is compromised
        </h3>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          The attacker has the private key. Watch the guard reject execution.
          Then approve with a passkey to see authorized execution.
        </p>
      </div>

      <AnimatedFlow state={state} />

      {/* Status message */}
      <AnimatePresence mode="wait">
        {state === "failed" && (
          <motion.div
            key="fail-msg"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-red-700 text-sm font-medium">
              Execution blocked — missing authorization
            </p>
            <p className="text-red-500 text-xs mt-1 font-mono">
              Program error: MissingProof. Private key alone is not sufficient.
            </p>
          </motion.div>
        )}

        {state === "success" && (
          <motion.div
            key="success-msg"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3"
          >
            <p className="text-green-800 text-sm font-medium">
              Transaction executed successfully
            </p>
            <p className="text-green-600 text-xs mt-1">
              Passkey proof verified onchain. Execution authorized.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        {state !== "failed" && (
          <button
            onClick={simulate}
            disabled={loading}
            className="px-5 py-2.5 rounded-full border border-border bg-bg text-ink text-sm font-medium hover:bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Simulate attack
          </button>
        )}

        {state === "failed" && (
          <button
            onClick={approve}
            disabled={loading}
            className="px-5 py-2.5 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Approve with passkey
          </button>
        )}

        {state !== "idle" && (
          <button
            onClick={reset}
            disabled={loading}
            className="px-5 py-2.5 rounded-full border border-border text-muted text-sm hover:text-ink hover:bg-card transition-colors disabled:opacity-40"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
