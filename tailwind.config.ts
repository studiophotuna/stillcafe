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
        maroon: "#5c1f1a",
        caramel: "#c08457",
        sage: "#7d9171",
        amber: "#d4a853",
        clay: "#a07358",
        sand: "#f0e6d8",
      },
      fontFamily: {
        serif: [
          "var(--font-sans)",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-sans)",
          "system-ui",
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
        collage: "collageScroll 50s ease-in-out infinite alternate",
        float: "float 6s ease-in-out infinite",
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
        collageScroll: {
          "0%": { transform: "translate(0, 0)" },
          "100%": { transform: "translate(-6%, -4%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
