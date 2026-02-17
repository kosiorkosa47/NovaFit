import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(6, 95, 70, 0.35)",
        "zen": "0 4px 24px -4px rgba(16, 185, 129, 0.08), 0 0 0 1px rgba(16, 185, 129, 0.04)",
        "zen-hover": "0 8px 32px -4px rgba(16, 185, 129, 0.14), 0 0 0 1px rgba(16, 185, 129, 0.06)"
      },
      backgroundImage: {
        "health-gradient":
          "radial-gradient(circle at 20% 10%, rgba(16, 185, 129, 0.14), transparent 40%), radial-gradient(circle at 80% 20%, rgba(20, 184, 166, 0.13), transparent 38%), linear-gradient(180deg, rgba(255,255,255,0.9), rgba(240,253,250,0.95))"
      },
      transitionTimingFunction: {
        zen: "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)"
      },
      keyframes: {
        aurora: {
          "0%": { backgroundPosition: "50% 50%, 50% 50%" },
          "50%": { backgroundPosition: "350% 50%, 350% 50%" },
          "100%": { backgroundPosition: "50% 50%, 50% 50%" }
        },
        breathe: {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "0.7",
            boxShadow: "0 0 0 0 rgba(16, 185, 129, 0.3)"
          },
          "50%": {
            transform: "scale(1.12)",
            opacity: "1",
            boxShadow: "0 0 40px 10px rgba(16, 185, 129, 0.15)"
          }
        },
        "blob-morph": {
          "0%, 100%": { borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" },
          "25%": { borderRadius: "58% 42% 34% 66% / 63% 68% 32% 37%" },
          "50%": { borderRadius: "50% 50% 34% 66% / 56% 68% 32% 44%" },
          "75%": { borderRadius: "33% 67% 58% 42% / 63% 38% 62% 37%" }
        }
      },
      animation: {
        aurora: "aurora 60s linear infinite",
        breathe: "breathe 8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "blob-morph": "blob-morph 20s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
