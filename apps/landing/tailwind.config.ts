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
        mono:  ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        bg:     "#0a0a0b",
        card:   "#111114",
        border: "rgba(235,232,224,0.10)",
        ink:    "#ebe8e0",     // primary type · bone
        muted:  "rgba(235,232,224,0.62)",
        faint:  "rgba(235,232,224,0.38)",
        // Semantic accent tokens (keep existing class names)
        accent: "#c6ff3a",    // lime
        coral:  "#ff5b1f",    // plasma
        sky:    "#5aa9ff",    // azure
        danger: "#ff3b4e",
        gold:   "#f3d77a",
        violet: "#b794ff",
        // Brand name tokens
        lime:   "#c6ff3a",
        plasma: "#ff5b1f",
        azure:  "#5aa9ff",
        bone:   "#ebe8e0",
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
