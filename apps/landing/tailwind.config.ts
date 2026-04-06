import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ["Inter", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
      },
      colors: {
        bg:      "#F5F0E8",
        card:    "#EFEBE2",
        border:  "#DDD8CF",
        ink:     "#141414",
        muted:   "#6B6560",
        faint:   "#A09890",
        accent:  "#CC785C",
        "accent-light": "#E8C4B0",
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
        "fade-up": "fadeUp 0.5s ease both",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
