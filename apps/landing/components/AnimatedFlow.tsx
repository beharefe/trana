"use client"

import { motion, AnimatePresence } from "framer-motion"

interface AnimatedFlowProps {
  state: "idle" | "failed" | "success"
}

const stepVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

const arrowVariants = {
  hidden: { opacity: 0, scaleY: 0 },
  visible: { opacity: 1, scaleY: 1 },
}

function Arrow() {
  return (
    <motion.div
      variants={arrowVariants}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col items-center my-1 origin-top"
    >
      <div className="w-px h-6 bg-white/10" />
      <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-white/20" />
    </motion.div>
  )
}

export function AnimatedFlow({ state }: AnimatedFlowProps) {
  return (
    <div className="flex flex-col items-center select-none">
      {/* Step 1: Signed Transaction */}
      <motion.div
        variants={stepVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.4, delay: 0 }}
        className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-gray-300"
      >
        <span className="text-base">📄</span>
        <span>Signed Transaction</span>
      </motion.div>

      <Arrow />

      {/* Step 2: Trana Guard */}
      <motion.div
        variants={stepVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex items-center gap-2 px-5 py-3 rounded-xl border border-purple-500/30 bg-purple-500/5 text-sm text-purple-300"
      >
        <span className="text-base">🛡</span>
        <span className="font-medium">Trana Guard</span>
      </motion.div>

      <Arrow />

      {/* Step 3: Result */}
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="idle"
            variants={stepVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-sm text-gray-500"
          >
            <span className="text-base">⏳</span>
            <span>Awaiting authorization…</span>
          </motion.div>
        )}

        {state === "failed" && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 400, damping: 20 }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm text-red-400"
          >
            <span className="text-base">❌</span>
            <span className="font-medium">Execution blocked</span>
          </motion.div>
        )}

        {state === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 400, damping: 20 }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-green-500/30 bg-green-500/5 text-sm text-green-400"
          >
            <span className="text-base">✅</span>
            <span className="font-medium">Transaction executed</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
