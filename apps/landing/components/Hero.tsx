"use client"

import { motion } from "framer-motion"

const ease = [0.16, 1, 0.3, 1]

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    >
      <div className="max-w-3xl mx-auto space-y-7">

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="text-xs font-medium tracking-widest uppercase text-muted"
        >
          Onchain Authorization · Solana
        </motion.p>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease }}
          className="font-serif text-6xl sm:text-7xl lg:text-8xl leading-[1.05] tracking-[-0.02em] text-ink"
        >
          Your key gets stolen.
          <br />
          <span className="italic text-accent">Your funds don&apos;t move.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.18, ease }}
          className="text-lg sm:text-xl text-muted max-w-xl mx-auto leading-relaxed"
        >
          Trana enforces a second-factor approval at the exact moment a transaction
          executes onchain — not when it was signed.
          A compromised key is no longer sufficient.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.28, ease }}
          className="flex flex-wrap gap-3 justify-center pt-1"
        >
          <button
            onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
            className="px-6 py-2.5 rounded-full bg-ink text-bg text-sm font-medium hover:bg-ink/90 transition-colors"
          >
            Try live demo
          </button>
          <button
            onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            className="px-6 py-2.5 rounded-full border border-border text-ink text-sm font-medium hover:bg-card transition-colors"
          >
            How it works
          </button>
        </motion.div>

        {/* Proof stat */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55, ease }}
          className="flex flex-wrap justify-center gap-8 pt-4 text-faint text-xs"
        >
          {[
            ["15", "Anchor test scenarios"],
            ["secp256r1", "Native passkey curve"],
            ["Anchor 0.32", "Zero new dependencies"],
          ].map(([val, label]) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-ink text-sm font-medium">{val}</span>
              <span>{label}</span>
            </div>
          ))}
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
          className="w-px h-8 bg-gradient-to-b from-transparent via-muted/30 to-transparent mx-auto"
        />
      </motion.div>
    </section>
  )
}
