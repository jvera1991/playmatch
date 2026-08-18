import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effef7",
          100: "#d8fdec",
          200: "#b4f9db",
          300: "#78f0bf",
          400: "#38df9d",
          500: "#12c581",
          600: "#08a06a",
          700: "#0a7f57",
          800: "#0d6547",
          900: "#0c533c",
          950: "#022f22",
        },
        ink: {
          50: "#f5f7fa",
          100: "#e9edf3",
          200: "#cfd8e3",
          400: "#7c8aa0",
          600: "#3d4a5f",
          800: "#1b2434",
          900: "#101725",
          950: "#080c14",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.5s ease-out both",
        float: "float 4s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
      backgroundImage: {
        "brand-glow":
          "radial-gradient(60% 60% at 50% 0%, rgba(18,197,129,0.18) 0%, rgba(18,197,129,0) 70%)",
        "brand-gradient": "linear-gradient(135deg, #08a06a 0%, #12c581 50%, #38df9d 100%)",
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgba(16,23,37,0.08), 0 1px 2px -1px rgba(16,23,37,0.04)",
        lift: "0 20px 40px -12px rgba(8,160,106,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
