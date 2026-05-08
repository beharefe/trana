import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono:  ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        bg:     "#0a0a0b",
        card:   "#101012",
        border: "rgba(235,232,224,0.10)",
        ink:    "#ebe8e0",
        muted:  "rgba(235,232,224,0.62)",
        faint:  "rgba(235,232,224,0.38)",
        accent: "#c6ff3a",
        coral:  "#ff5b1f",
        sky:    "#5aa9ff",
        danger: "#ff3b4e",
        gold:   "#f3d77a",
        violet: "#b794ff",
        lime:   "#c6ff3a",
        plasma: "#ff5b1f",
        azure:  "#5aa9ff",
        bone:   "#ebe8e0",
        amber:  "#f5a623",
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
