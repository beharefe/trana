"use client"

import { motion } from "framer-motion"

interface SectionProps {
  children: React.ReactNode
  className?: string
  id?: string
  center?: boolean
}

export function Section({ children, className = "", id, center = true }: SectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`py-24 max-w-4xl mx-auto px-6 ${center ? "text-center" : ""} ${className}`}
    >
      {children}
    </motion.section>
  )
}
