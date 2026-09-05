/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#14110E",
        surface: "#1C1815",
        "surface-low": "#181411",
        "surface-high": "#231F1B",
        "surface-highest": "#2C2622",
        "on-surface": "#F3EEE4",
        "on-surface-muted": "#9C948A",
        accent: "#C9A876",
        "accent-dim": "#8A7654",
        "accent-bg": "rgba(201, 168, 118, 0.08)",
        outline: "rgba(243, 238, 228, 0.12)",
        "outline-strong": "rgba(243, 238, 228, 0.22)",
        success: "#7FA88C",
        "success-bg": "rgba(127, 168, 140, 0.12)",
        danger: "#B97C6B",
        "danger-bg": "rgba(185, 124, 107, 0.12)",
      },
      fontFamily: {
        serif: ["Newsreader", "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
