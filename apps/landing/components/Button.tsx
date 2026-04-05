"use client"

import { motion } from "framer-motion"

interface ButtonProps {
  children: React.ReactNode
  variant?: "primary" | "ghost"
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function Button({
  children,
  variant = "primary",
  onClick,
  disabled,
  className = "",
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed"

  const variants = {
    primary:
      "bg-white text-black hover:bg-gray-100 active:scale-[0.98]",
    ghost:
      "border border-white/10 text-gray-300 hover:border-white/30 hover:text-white active:scale-[0.98]",
  }

  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </motion.button>
  )
}
