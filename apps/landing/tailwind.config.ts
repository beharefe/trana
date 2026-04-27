import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        bg:     "#08090b",
        card:   "#0d0e11",
        border: "rgba(255,255,255,0.08)",
        ink:    "#f4f4f5",
        muted:  "#a1a1aa",
        faint:  "#71717a",
        accent: "#7af0a8",
        coral:  "#ff7a59",
        violet: "#b794ff",
        danger: "#ff5560",
        sky:    "#7aa8ff",
        gold:   "#f3d77a",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-6px)" },
          "40%":      { transform: "translateX(6px)" },
          "60%":      { transform: "translateX(-4px)" },
          "80%":      { transform: "translateX(4px)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
