import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--sans)", ...fontFamily.sans],
        mono: ["var(--mono)", ...fontFamily.mono],
      },
      colors: {
        mt: {
          bg: "var(--bg)",
          "bg-elev": "var(--bg-elev)",
          "bg-soft": "var(--bg-soft)",
          "bg-hover": "var(--bg-hover)",
          border: "var(--border)",
          "border-2": "var(--border-2)",
          text: "var(--text)",
          "text-2": "var(--text-2)",
          "text-3": "var(--text-3)",
          "text-4": "var(--text-4)",
          ink: "var(--ink)",
          "ink-2": "var(--ink-2)",
          violet: "var(--violet)",
          amber: "var(--amber)",
          rose: "var(--rose)",
          cyan: "var(--cyan)",
          green: "var(--green)",
        },
        border: "hsl(var(--border-hsl))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        moveUpDown: {
          "0%": { transform: "translateY(5px)", opacity: "0" },
          "15%": { transform: "translateY(0px)", opacity: "1" },
          "85%": { transform: "translateY(0px)", opacity: "1" },
          "100%": { transform: "translateY(-5px)", opacity: "0" },
        },
        shimmer: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        moveUpDown: "moveUpDown ease-in-out 3s infinite",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
