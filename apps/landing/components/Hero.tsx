"use client"

import { motion } from "framer-motion"
import { Button } from "./Button"

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden"
    >
      {/* Subtle radial glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(168,85,247,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-4xl mx-auto space-y-8">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 text-purple-400 text-xs font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Built for Solana Frontier Hackathon
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1]"
        >
          Unstealable
          <br />
          <span className="text-purple-400">Transactions</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-xl sm:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed"
        >
          Your private key gets stolen.
          <br className="hidden sm:block" />
          <span className="text-white">Your funds don&apos;t have to move.</span>
        </motion.p>

        {/* Supporting copy */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-base text-gray-500 max-w-lg mx-auto leading-relaxed"
        >
          Trana enforces a second-factor approval at the exact moment a transaction
          executes — not when it was signed. A compromised key is no longer enough.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap gap-4 justify-center pt-2"
        >
          <Button
            variant="primary"
            onClick={() =>
              document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Try Live Demo
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            View How It Works
          </Button>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        aria-hidden
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          className="w-px h-10 bg-gradient-to-b from-transparent via-white/20 to-transparent mx-auto"
        />
      </motion.div>
    </section>
  )
}
