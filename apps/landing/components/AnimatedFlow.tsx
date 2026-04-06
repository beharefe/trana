"use client"

import { motion, AnimatePresence } from "framer-motion"

interface AnimatedFlowProps {
  state: "idle" | "failed" | "success"
}

function Arrow() {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="w-px h-5 bg-border" />
      <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-border" />
    </div>
  )
}

export function AnimatedFlow({ state }: AnimatedFlowProps) {
  return (
    <div className="flex flex-col items-center select-none">

      {/* Step 1: Signed transaction */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-border bg-bg text-sm text-ink"
      >
        <span className="w-2 h-2 rounded-full bg-faint" />
        <span>Signed transaction</span>
      </motion.div>

      <Arrow />

      {/* Step 2: Guard */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-accent/40 bg-accent/5 text-sm text-accent font-medium"
      >
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span>Trana Guard</span>
      </motion.div>

      <Arrow />

      {/* Step 3: Result */}
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.3 }}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-border bg-bg text-sm text-faint"
          >
            <span className="w-2 h-2 rounded-full bg-border" />
            <span>Awaiting authorization…</span>
          </motion.div>
        )}

        {state === "failed" && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 font-medium animate-shake"
          >
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span>Execution blocked</span>
          </motion.div>
        )}

        {state === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-800 font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Transaction executed</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
