import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "rgb(var(--color-page-bg, 250 246 240) / <alpha-value>)",
        latte: "rgb(var(--color-border, 232 221 208) / <alpha-value>)",
        mocha: "rgb(var(--color-accent, 111 78 55) / <alpha-value>)",
        espresso: "rgb(var(--color-text, 44 30 20) / <alpha-value>)",
        maroon: "rgb(var(--color-primary, 92 31 26) / <alpha-value>)",
        caramel: "rgb(var(--color-highlight, 192 132 87) / <alpha-value>)",
        sand: "rgb(var(--color-surface, 240 230 216) / <alpha-value>)",
        card: "rgb(var(--color-card, 255 255 255) / <alpha-value>)",
        sage: "#7d9171",
        amber: "#d4a853",
        clay: "#a07358",
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "Cambria", "serif"],
        sans: [
          "var(--font-body)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px -2px rgba(0,0,0,0.06)",
        glow: "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px -4px rgba(0,0,0,0.1)",
        card: "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px -2px rgba(0,0,0,0.06)",
        elevated:
          "0 2px 4px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.12)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        collage: "collageScroll 50s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        collageScroll: {
          "0%": { transform: "translate(0, 0)" },
          "100%": { transform: "translate(-6%, -4%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
