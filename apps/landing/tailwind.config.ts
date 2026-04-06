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
        serif: ["DM Serif Display", "Georgia", "serif"],
      },
      colors: {
        bg:     "#F7F6F3",
        card:   "#EEECEA",
        border: "#D8D4CE",
        ink:    "#111111",
        muted:  "#5C5855",
        faint:  "#9E9A96",
        accent: "#16A34A",
        "accent-light": "#DCFCE7",
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
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
