"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./Button"
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
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 space-y-8">
      <div>
        <p className="text-xs text-purple-400 uppercase tracking-widest font-medium mb-2">
          Attack Simulation — Drift-style
        </p>
        <h3 className="text-xl font-semibold text-white">
          See what happens when a key is compromised
        </h3>
        <p className="text-gray-500 text-sm mt-2">
          The attacker has the private key. Watch the guard reject execution.
        </p>
      </div>

      <AnimatedFlow state={state} />

      {/* Status message */}
      <AnimatePresence mode="wait">
        {state === "failed" && (
          <motion.div
            key="fail-msg"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3"
          >
            <p className="text-red-400 text-sm font-medium">
              ❌ Execution blocked — missing authorization
            </p>
            <p className="text-red-400/60 text-xs mt-1">
              Program error: <span className="font-mono">MissingProof</span>. Private key alone is not sufficient.
            </p>
          </motion.div>
        )}

        {state === "success" && (
          <motion.div
            key="success-msg"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3"
          >
            <p className="text-green-400 text-sm font-medium">
              ✅ Transaction executed successfully
            </p>
            <p className="text-green-400/60 text-xs mt-1">
              Passkey proof verified onchain. Execution authorized.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        {state !== "failed" && (
          <Button
            variant="ghost"
            onClick={simulate}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <span className="text-red-400">⚡</span>
            Simulate malicious transaction
          </Button>
        )}

        {state === "failed" && (
          <Button
            variant="primary"
            onClick={approve}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <span>🔑</span>
            Approve with passkey
          </Button>
        )}

        {state !== "idle" && (
          <Button variant="ghost" onClick={reset} disabled={loading}>
            Reset
          </Button>
        )}
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
