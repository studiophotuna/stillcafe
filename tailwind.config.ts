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
        cream: "#faf6f0",
        latte: "#e8ddd0",
        mocha: "#6f4e37",
        espresso: "#2c1e14",
        caramel: "#c08457",
        sage: "#7d9171",
        amber: "#d4a853",
        clay: "#a07358",
        sand: "#f0e6d8",
      },
      fontFamily: {
        serif: [
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 2px 20px -4px rgba(44, 30, 20, 0.08)",
        glow: "0 4px 30px -6px rgba(44, 30, 20, 0.12)",
        card: "0 1px 3px rgba(44, 30, 20, 0.06), 0 8px 24px -8px rgba(44, 30, 20, 0.08)",
        elevated:
          "0 2px 8px rgba(44, 30, 20, 0.06), 0 16px 40px -12px rgba(44, 30, 20, 0.14)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
