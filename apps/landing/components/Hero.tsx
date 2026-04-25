"use client"

import Link from "next/link"
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
          Execution requires approval.
          <br />
          <span className="italic">A valid signature is not enough.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease }}
          className="text-xl text-muted max-w-xl mx-auto leading-[1.7]"
        >
          Trana enforces second-factor authorization at execution time.
          High-risk actions do not execute without explicit approval.
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
            Try demo
          </button>
          <Link
            href="/docs/quickstart"
            className="px-7 py-3 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
          >
            Read the docs
          </Link>
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
