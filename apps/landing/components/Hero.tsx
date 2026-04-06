"use client"

import { motion } from "framer-motion"

const ease = [0.16, 1, 0.3, 1]

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center"
    >
      <div className="max-w-3xl mx-auto space-y-9">

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="text-xs font-medium tracking-[0.2em] uppercase text-faint"
        >
          Onchain Authorization · Solana
        </motion.p>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease }}
          className="font-serif text-6xl sm:text-7xl lg:text-[5.5rem] leading-[1.06] tracking-[-0.025em] text-ink"
        >
          Your key gets stolen.
          <br />
          <span className="italic">Your funds don&apos;t move.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease }}
          className="text-xl text-muted max-w-xl mx-auto leading-[1.7]"
        >
          Trana enforces second-factor authorization at execution time, not signing time.
          A stolen key alone is no longer sufficient to execute protected transactions.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.28, ease }}
          className="flex flex-wrap gap-3 justify-center pt-2"
        >
          <button
            onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
            className="px-7 py-3 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/85 transition-colors"
          >
            Try live demo
          </button>
          <button
            onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            className="px-7 py-3 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
          >
            How it works
          </button>
        </motion.div>

      </div>

      {/* Scroll nudge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        aria-hidden
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-px h-8 bg-gradient-to-b from-transparent via-border to-transparent mx-auto"
        />
      </motion.div>
    </section>
  )
}
