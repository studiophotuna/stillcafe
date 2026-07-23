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
        cream: "#faf8f5",
        latte: "#ede8e0",
        mocha: "#6f4e37",
        espresso: "#1a1210",
        maroon: "#5c1f1a",
        caramel: "#c08457",
        sage: "#5b8a5a",
        amber: "#d4a853",
        clay: "#a07358",
        sand: "#f2ece4",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26, 18, 16, 0.04), 0 2px 8px rgba(26, 18, 16, 0.04)",
        card: "0 1px 2px rgba(26, 18, 16, 0.03), 0 4px 16px rgba(26, 18, 16, 0.06)",
        elevated: "0 4px 24px rgba(26, 18, 16, 0.10)",
        glow: "0 0 0 3px rgba(92, 31, 26, 0.12)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.6s ease-out",
        "slide-up-delay": "slideUp 0.6s ease-out 0.15s both",
        "scale-in": "scaleIn 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
