# MindTab Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-energy, dark-themed Astro landing page for MindTab with interactive AI assistant demos, vault showcase animations, and conversion-optimized pricing.

**Architecture:** Astro static site in `apps/landing/` within the pnpm monorepo. All interactivity (chat demo, cycling examples, accordion, scroll animations) uses vanilla JS in Astro `<script>` tags — no React needed. CSS animations for visual effects, Intersection Observer for scroll triggers.

**Tech Stack:** Astro 5, Tailwind CSS 3, vanilla TypeScript, Geist Sans font

**Spec:** `docs/superpowers/specs/2026-03-26-landing-page-design.md`

---

## File Structure

```
apps/landing/
├── public/
│   ├── fonts/
│   │   └── Geist-Variable.woff2          # Copy from apps/web/public/fonts/
│   └── images/                            # Product screenshots (added later)
├── src/
│   ├── components/
│   │   ├── Navbar.astro                   # Top nav with logo, links, sign-in
│   │   ├── Hero.astro                     # Headline, subtext, CTAs, gradient bg
│   │   ├── ChatDemo.astro                 # Interactive AI chat simulation in hero
│   │   ├── AssistantSection.astro         # AI assistant deep-dive with cycling examples
│   │   ├── VaultSection.astro             # Vault showcase with processing animation
│   │   ├── FeaturesSection.astro          # Goals, habits, journals with screenshots
│   │   ├── CrossPlatformSection.astro     # Device mockup spread
│   │   ├── HowItWorksSection.astro        # 4-step flow
│   │   ├── PricingSection.astro           # 3-tier pricing cards
│   │   ├── FAQSection.astro               # Accordion FAQ
│   │   ├── FooterCTA.astro                # Final conversion block
│   │   └── Footer.astro                   # Site footer
│   ├── layouts/
│   │   └── Layout.astro                   # Base HTML layout with fonts, meta, globals
│   ├── pages/
│   │   └── index.astro                    # Main page assembling all sections
│   └── styles/
│       └── globals.css                    # CSS variables, font-face, base styles
├── astro.config.mjs                       # Astro config with Tailwind integration
├── tailwind.config.mjs                    # Tailwind theme matching web app
├── tsconfig.json                          # TypeScript config
└── package.json                           # @mindtab/landing workspace package
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `apps/landing/package.json`
- Create: `apps/landing/astro.config.mjs`
- Create: `apps/landing/tailwind.config.mjs`
- Create: `apps/landing/tsconfig.json`
- Copy: `apps/web/public/fonts/Geist-Variable.woff2` → `apps/landing/public/fonts/Geist-Variable.woff2`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@mindtab/landing",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 3000",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^5.7.10",
    "@astrojs/tailwind": "^6.0.2",
    "tailwindcss": "^3.4.3",
    "autoprefixer": "^10.4.19",
    "tailwindcss-animate": "^1.0.7",
    "lucide-astro": "^0.469.0"
  },
  "devDependencies": {
    "typescript": "^5.5.3"
  }
}
```

Write this to `apps/landing/package.json`.

- [ ] **Step 2: Create astro.config.mjs**

```javascript
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "static",
});
```

Write this to `apps/landing/astro.config.mjs`.

- [ ] **Step 3: Create tailwind.config.mjs**

```javascript
import defaultTheme from "tailwindcss/defaultTheme";
import tailwindAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist Sans", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        border: "hsl(var(--border))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        shimmer: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        float: "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [tailwindAnimate],
};
```

Write this to `apps/landing/tailwind.config.mjs`.

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Write this to `apps/landing/tsconfig.json`.

- [ ] **Step 5: Copy font file**

```bash
mkdir -p apps/landing/public/fonts
cp apps/web/public/fonts/Geist-Variable.woff2 apps/landing/public/fonts/Geist-Variable.woff2
```

- [ ] **Step 6: Remove .gitkeep**

```bash
rm apps/landing/.gitkeep
```

- [ ] **Step 7: Install dependencies**

```bash
cd apps/landing && pnpm install
```

- [ ] **Step 8: Commit**

```bash
git add apps/landing/
git commit -m "chore(landing): scaffold Astro project with Tailwind"
```

---

## Task 2: Base Layout & Global Styles

**Files:**
- Create: `apps/landing/src/styles/globals.css`
- Create: `apps/landing/src/layouts/Layout.astro`
- Create: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create globals.css**

This includes CSS variables matching the web app, font-face declaration, and landing-page-specific animation utilities.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  @font-face {
    font-family: "Geist Sans";
    src: url("/fonts/Geist-Variable.woff2") format("woff2");
    font-weight: 100 900;
    font-display: swap;
    font-style: normal;
  }

  :root {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
    --radius: 0.5rem;
  }

  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: "Geist Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  html {
    scroll-behavior: smooth;
  }
}

@layer utilities {
  .text-gradient {
    background: linear-gradient(to bottom, #e5e5e5, #737373);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .text-gradient-warm {
    background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .glow-warm {
    box-shadow: 0 0 80px 20px rgba(251, 191, 36, 0.15),
                0 0 160px 60px rgba(192, 132, 252, 0.08);
  }

  .glow-warm-subtle {
    box-shadow: 0 0 40px 10px rgba(251, 191, 36, 0.08),
                0 0 80px 30px rgba(192, 132, 252, 0.04);
  }

  .bg-gradient-warm {
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(251, 191, 36, 0.12) 0%,
      rgba(192, 132, 252, 0.06) 40%,
      transparent 70%
    );
  }

  .bg-gradient-warm-intense {
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(251, 191, 36, 0.2) 0%,
      rgba(192, 132, 252, 0.1) 40%,
      transparent 70%
    );
  }

  /* Scroll-triggered animation: elements start invisible, JS adds .is-visible */
  .animate-on-scroll {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }

  .animate-on-scroll.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Staggered children */
  .stagger-children > .animate-on-scroll:nth-child(1) { transition-delay: 0ms; }
  .stagger-children > .animate-on-scroll:nth-child(2) { transition-delay: 150ms; }
  .stagger-children > .animate-on-scroll:nth-child(3) { transition-delay: 300ms; }
  .stagger-children > .animate-on-scroll:nth-child(4) { transition-delay: 450ms; }
}
```

Write this to `apps/landing/src/styles/globals.css`.

- [ ] **Step 2: Create Layout.astro**

```astro
---
interface Props {
  title?: string;
  description?: string;
}

const {
  title = "MindTab — Your second brain that actually does things",
  description = "Track goals, build habits, save knowledge — and let AI handle the rest. Available on web, mobile, and Chrome.",
} = Astro.props;
---

<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title}</title>

    <link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin />

    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://mindtab.in" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
  </head>
  <body class="min-h-screen bg-background text-foreground antialiased">
    <slot />

    <!-- Global scroll animation observer -->
    <script>
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
      );

      document.querySelectorAll(".animate-on-scroll").forEach((el) => {
        observer.observe(el);
      });
    </script>
  </body>
</html>
```

Write this to `apps/landing/src/layouts/Layout.astro`.

- [ ] **Step 3: Create placeholder index.astro**

```astro
---
import Layout from "../layouts/Layout.astro";
import "../styles/globals.css";
---

<Layout>
  <main>
    <div class="flex min-h-screen items-center justify-center">
      <h1 class="text-4xl font-bold text-gradient">MindTab Landing Page</h1>
    </div>
  </main>
</Layout>
```

Write this to `apps/landing/src/pages/index.astro`.

- [ ] **Step 4: Verify the dev server starts**

```bash
cd apps/landing && pnpm dev
```

Expected: Astro dev server starts on port 3000. Page shows "MindTab Landing Page" in gradient text on a dark background.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add base layout, global styles, and index page"
```

---

## Task 3: Navbar

**Files:**
- Create: `apps/landing/src/components/Navbar.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create Navbar.astro**

```astro
---
const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];
---

<nav class="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
  <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
    <!-- Logo -->
    <a href="/" class="flex items-center gap-2">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-purple-500">
        <span class="text-sm font-bold text-black">M</span>
      </div>
      <span class="text-lg font-semibold">MindTab</span>
    </a>

    <!-- Desktop Links -->
    <div class="hidden items-center gap-8 md:flex">
      {navLinks.map((link) => (
        <a
          href={link.href}
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.label}
        </a>
      ))}
      <a
        href="https://app.mindtab.in"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign In
      </a>
    </div>

    <!-- Mobile menu button -->
    <button
      id="mobile-menu-btn"
      class="flex h-10 w-10 items-center justify-center rounded-md hover:bg-secondary md:hidden"
      aria-label="Toggle menu"
    >
      <svg id="menu-icon" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <svg id="close-icon" class="hidden h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Mobile menu -->
  <div id="mobile-menu" class="hidden border-t border-border/50 bg-background/95 backdrop-blur-lg md:hidden">
    <div class="flex flex-col gap-1 px-6 py-4">
      {navLinks.map((link) => (
        <a
          href={link.href}
          class="mobile-nav-link rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {link.label}
        </a>
      ))}
      <a
        href="https://app.mindtab.in"
        class="mobile-nav-link mt-2 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign In
      </a>
    </div>
  </div>
</nav>

<script>
  const btn = document.getElementById("mobile-menu-btn")!;
  const menu = document.getElementById("mobile-menu")!;
  const menuIcon = document.getElementById("menu-icon")!;
  const closeIcon = document.getElementById("close-icon")!;

  btn.addEventListener("click", () => {
    const isOpen = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    menuIcon.classList.toggle("hidden");
    closeIcon.classList.toggle("hidden");
  });

  // Close menu when clicking a nav link
  document.querySelectorAll(".mobile-nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.add("hidden");
      menuIcon.classList.remove("hidden");
      closeIcon.classList.add("hidden");
    });
  });
</script>
```

Write this to `apps/landing/src/components/Navbar.astro`.

- [ ] **Step 2: Add Navbar to index.astro**

Replace the content of `apps/landing/src/pages/index.astro` with:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main class="pt-16">
    <div class="flex min-h-screen items-center justify-center">
      <h1 class="text-4xl font-bold text-gradient">MindTab Landing Page</h1>
    </div>
  </main>
</Layout>
```

- [ ] **Step 3: Verify navbar renders**

```bash
cd apps/landing && pnpm dev
```

Expected: Fixed navbar at top with logo, desktop links (Features, Pricing, FAQ, Sign In). On mobile viewport, hamburger icon toggles the mobile menu.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add responsive navbar with mobile menu"
```

---

## Task 4: Hero Section

**Files:**
- Create: `apps/landing/src/components/Hero.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create Hero.astro**

```astro
<section class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16">
  <!-- Background gradient glow -->
  <div class="pointer-events-none absolute inset-0 bg-gradient-warm-intense"></div>

  <!-- Content -->
  <div class="relative z-10 flex max-w-4xl flex-col items-center text-center">
    <!-- Badge -->
    <div class="mb-6 rounded-full border border-border/50 bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
      Your AI-powered second brain
    </div>

    <!-- Headline -->
    <h1 class="mb-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
      <span class="text-gradient">Your second brain that</span>
      <br />
      <span class="text-gradient-warm">actually does things</span>
    </h1>

    <!-- Subtext -->
    <p class="mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
      Track goals, build habits, save knowledge — and let AI handle the rest.
      Just open the app and say what you want.
    </p>

    <!-- CTAs -->
    <div class="mb-12 flex flex-col items-center gap-4 sm:flex-row">
      <a
        href="https://app.mindtab.in"
        class="inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-amber-500 to-purple-500 px-8 text-base font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:brightness-110"
      >
        Get Started Free
      </a>
      <a
        href="https://chromewebstore.google.com/detail/mindtab/ndnegdefonikfckhbgmejdodebnbhjll"
        class="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-8 text-base font-medium transition-colors hover:bg-secondary"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.6"/>
          <path d="M12 2a10 10 0 0 1 8.66 5H12" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M2 12a10 10 0 0 1 3.34-7.47L8.5 12" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M15.5 12l3.16 5.47A10 10 0 0 1 12 22" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        Get Chrome Extension
      </a>
    </div>

    <!-- Chat Demo slot -->
    <div id="chat-demo-container" class="w-full max-w-2xl">
      <slot />
    </div>
  </div>

  <!-- Bottom fade to next section -->
  <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent"></div>
</section>
```

Write this to `apps/landing/src/components/Hero.astro`.

- [ ] **Step 2: Add Hero to index.astro**

Replace the content of `apps/landing/src/pages/index.astro` with:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import Hero from "../components/Hero.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main>
    <Hero />
  </main>
</Layout>
```

- [ ] **Step 3: Verify hero renders**

```bash
cd apps/landing && pnpm dev
```

Expected: Full-viewport hero with gradient headline, warm accent on "actually does things", two CTA buttons with the primary one having an amber-to-purple gradient, and a warm radial glow behind the content.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add hero section with gradient headline and CTAs"
```

---

## Task 5: Interactive Chat Demo

**Files:**
- Create: `apps/landing/src/components/ChatDemo.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create ChatDemo.astro**

This is the "dub.co moment" — a simulated AI assistant conversation that auto-plays in the hero.

```astro
<div class="overflow-hidden rounded-xl border border-border/50 bg-secondary/30 shadow-2xl glow-warm-subtle backdrop-blur-sm">
  <!-- Chat header -->
  <div class="flex items-center gap-2 border-b border-border/50 px-4 py-3">
    <div class="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse-glow"></div>
    <span class="text-xs text-muted-foreground">MindTab Assistant</span>
  </div>

  <!-- Chat messages -->
  <div class="flex flex-col gap-3 p-4" id="chat-messages">
    <!-- User message -->
    <div class="flex justify-end opacity-0" id="chat-msg-1">
      <div class="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-500/20 px-4 py-2.5">
        <p class="text-sm" id="chat-msg-1-text"></p>
      </div>
    </div>

    <!-- Assistant thinking indicator -->
    <div class="flex justify-start opacity-0" id="chat-thinking">
      <div class="rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5">
        <div class="flex gap-1">
          <div class="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style="animation-delay: 0ms"></div>
          <div class="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style="animation-delay: 150ms"></div>
          <div class="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    </div>

    <!-- Assistant response -->
    <div class="flex justify-start opacity-0" id="chat-msg-2">
      <div class="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5">
        <p class="text-sm text-foreground" id="chat-msg-2-text"></p>
      </div>
    </div>

    <!-- Vault card result -->
    <div class="opacity-0 transition-all duration-500" id="chat-vault-card">
      <div class="mx-2 rounded-lg border border-border/50 bg-background/80 p-3">
        <div class="mb-2 flex items-center gap-2">
          <div class="flex h-6 w-6 items-center justify-center rounded bg-amber-500/20">
            <svg class="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <span class="text-xs font-medium">Saved to Vault</span>
          <span class="ml-auto text-xs text-muted-foreground">just now</span>
        </div>
        <p class="mb-2 text-sm font-medium">React Server Components — Deep Dive</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">React</span>
          <span class="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">Server Components</span>
          <span class="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">Frontend</span>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  const userMessage = "Save this article about React Server Components and add it to my frontend project";
  const assistantMessage = "Done! I've saved the article, extracted the key points, and tagged it under your Frontend Research project.";

  function typeText(element: HTMLElement, text: string, speed: number): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const interval = setInterval(() => {
        element.textContent = text.slice(0, i + 1);
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          resolve();
        }
      }, speed);
    });
  }

  function fadeIn(element: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      element.style.transition = "opacity 0.4s ease-out, transform 0.4s ease-out";
      element.style.transform = "translateY(8px)";
      requestAnimationFrame(() => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      });
      setTimeout(resolve, 400);
    });
  }

  async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playDemo(): Promise<void> {
    const msg1 = document.getElementById("chat-msg-1")!;
    const msg1Text = document.getElementById("chat-msg-1-text")!;
    const thinking = document.getElementById("chat-thinking")!;
    const msg2 = document.getElementById("chat-msg-2")!;
    const msg2Text = document.getElementById("chat-msg-2-text")!;
    const vaultCard = document.getElementById("chat-vault-card")!;

    await sleep(1000);

    // Show user message bubble and type
    await fadeIn(msg1);
    await typeText(msg1Text, userMessage, 25);
    await sleep(600);

    // Show thinking dots
    await fadeIn(thinking);
    await sleep(1200);

    // Hide thinking, show response
    thinking.style.opacity = "0";
    await sleep(200);

    await fadeIn(msg2);
    await typeText(msg2Text, assistantMessage, 18);
    await sleep(400);

    // Show vault card
    await fadeIn(vaultCard);
  }

  // Play on load, replay every 12 seconds
  playDemo();
</script>
```

Write this to `apps/landing/src/components/ChatDemo.astro`.

- [ ] **Step 2: Add ChatDemo to Hero in index.astro**

Update `apps/landing/src/pages/index.astro`:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import Hero from "../components/Hero.astro";
import ChatDemo from "../components/ChatDemo.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main>
    <Hero>
      <ChatDemo />
    </Hero>
  </main>
</Layout>
```

- [ ] **Step 3: Verify the chat demo plays**

```bash
cd apps/landing && pnpm dev
```

Expected: After 1 second, the user message types in character by character, thinking dots appear, then the assistant response types in, followed by a vault card sliding in with tags. The whole sequence takes about 8 seconds.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add interactive AI chat demo in hero section"
```

---

## Task 6: AI Assistant Deep-Dive Section

**Files:**
- Create: `apps/landing/src/components/AssistantSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create AssistantSection.astro**

```astro
<section id="features" class="relative px-6 py-24 md:py-32">
  <div class="mx-auto max-w-6xl">
    <div class="grid items-center gap-12 md:grid-cols-2">
      <!-- Text side -->
      <div class="animate-on-scroll">
        <p class="mb-3 text-sm font-medium uppercase tracking-wider text-amber-400">AI Assistant</p>
        <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          <span class="text-gradient">Just say what you want.</span>
          <br />
          <span class="text-gradient-warm">It handles the rest.</span>
        </h2>
        <p class="mb-6 text-lg text-muted-foreground">
          Not a generic chatbot. It knows your goals, your habits, your saved content.
          Ask anything, and it acts — with your full context.
        </p>

        <!-- Example prompt pills -->
        <div class="flex flex-wrap gap-2">
          <span class="cursor-default rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-500/20">"Mark my morning run as done"</span>
          <span class="cursor-default rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs text-purple-300 transition-colors hover:bg-purple-500/20">"How am I doing this week?"</span>
          <span class="cursor-default rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 transition-colors hover:bg-blue-500/20">"What did that article say about scaling?"</span>
        </div>
      </div>

      <!-- Demo side — cycling examples -->
      <div class="animate-on-scroll">
        <div class="overflow-hidden rounded-xl border border-border/50 bg-secondary/30 glow-warm-subtle">
          <!-- Demo header -->
          <div class="flex items-center gap-2 border-b border-border/50 px-4 py-3">
            <div class="h-2.5 w-2.5 rounded-full bg-green-400"></div>
            <span class="text-xs text-muted-foreground">Live Assistant</span>
            <div class="ml-auto flex gap-1" id="assistant-dots">
              <button class="h-1.5 w-1.5 rounded-full bg-amber-400 transition-colors" data-index="0"></button>
              <button class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-colors" data-index="1"></button>
              <button class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-colors" data-index="2"></button>
              <button class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-colors" data-index="3"></button>
            </div>
          </div>

          <!-- Example display -->
          <div class="p-5" id="assistant-demo-area" style="min-height: 200px;">
            <!-- Content populated by JS -->
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<script>
  interface AssistantExample {
    prompt: string;
    result: string;
    visual: string;
  }

  const examples: AssistantExample[] = [
    {
      prompt: "Mark my morning run habit as done",
      result: "Done! Morning run marked complete. You're on a 12-day streak! 🔥",
      visual: `<div class="mt-3 flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 p-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <div>
          <p class="text-sm font-medium">Morning Run</p>
          <p class="text-xs text-muted-foreground">12-day streak · 240 XP earned</p>
        </div>
        <div class="ml-auto text-lg">🔥</div>
      </div>`,
    },
    {
      prompt: "What did that microservices article say about scaling?",
      result: "From your saved article \"Scaling Microservices at Netflix\":",
      visual: `<div class="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
        <p class="mb-2 text-xs font-medium text-amber-400">From your Vault</p>
        <p class="text-sm text-muted-foreground">"The key insight is horizontal scaling of stateless services combined with event-driven communication. Netflix uses a circuit breaker pattern to prevent cascade failures..."</p>
        <div class="mt-2 flex gap-1.5">
          <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">Microservices</span>
          <span class="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">Scaling</span>
        </div>
      </div>`,
    },
    {
      prompt: "Create a goal to finish the landing page by Friday",
      result: "Goal created and added to your MindTab project.",
      visual: `<div class="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
        <div class="flex items-center gap-2">
          <span class="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">P1</span>
          <p class="text-sm font-medium">Finish the landing page</p>
        </div>
        <div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>📅 Due: Friday</span>
          <span>📁 MindTab</span>
          <span class="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400">In Progress</span>
        </div>
      </div>`,
    },
    {
      prompt: "How am I doing on my habits this week?",
      result: "Here's your weekly habit summary:",
      visual: `<div class="mt-3 space-y-2">
        <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 p-2.5">
          <span class="text-sm">🏃</span>
          <span class="flex-1 text-sm">Morning Run</span>
          <div class="flex gap-0.5">${["bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-muted", "bg-muted"].map((c) => `<div class="h-3 w-3 rounded-sm ${c}"></div>`).join("")}</div>
          <span class="text-xs text-green-400">5/7</span>
        </div>
        <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 p-2.5">
          <span class="text-sm">📖</span>
          <span class="flex-1 text-sm">Read 30 mins</span>
          <div class="flex gap-0.5">${["bg-green-500", "bg-green-500", "bg-green-500", "bg-muted", "bg-green-500", "bg-green-500", "bg-muted"].map((c) => `<div class="h-3 w-3 rounded-sm ${c}"></div>`).join("")}</div>
          <span class="text-xs text-green-400">5/7</span>
        </div>
        <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 p-2.5">
          <span class="text-sm">🧘</span>
          <span class="flex-1 text-sm">Meditate</span>
          <div class="flex gap-0.5">${["bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500", "bg-green-500"].map((c) => `<div class="h-3 w-3 rounded-sm ${c}"></div>`).join("")}</div>
          <span class="text-xs text-amber-400">7/7 🔥</span>
        </div>
      </div>`,
    },
  ];

  let currentIndex = 0;
  const demoArea = document.getElementById("assistant-demo-area")!;
  const dots = document.querySelectorAll("#assistant-dots button");

  function showExample(index: number): void {
    const ex = examples[index];
    demoArea.style.opacity = "0";
    demoArea.style.transform = "translateY(10px)";

    setTimeout(() => {
      demoArea.innerHTML = `
        <div class="mb-3">
          <p class="text-xs text-muted-foreground mb-1">You said:</p>
          <p class="text-sm font-medium">"${ex.prompt}"</p>
        </div>
        <div>
          <p class="text-sm text-muted-foreground">${ex.result}</p>
          ${ex.visual}
        </div>
      `;
      demoArea.style.transition = "opacity 0.4s ease-out, transform 0.4s ease-out";
      demoArea.style.opacity = "1";
      demoArea.style.transform = "translateY(0)";
    }, 300);

    // Update dots
    dots.forEach((dot, i) => {
      (dot as HTMLElement).className = i === index
        ? "h-1.5 w-1.5 rounded-full bg-amber-400 transition-colors"
        : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-colors";
    });
  }

  // Auto-cycle every 4 seconds
  showExample(0);
  setInterval(() => {
    currentIndex = (currentIndex + 1) % examples.length;
    showExample(currentIndex);
  }, 4000);

  // Click dots to jump
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      currentIndex = parseInt((dot as HTMLElement).dataset.index || "0");
      showExample(currentIndex);
    });
  });
</script>
```

Write this to `apps/landing/src/components/AssistantSection.astro`.

- [ ] **Step 2: Add section to index.astro**

Update `apps/landing/src/pages/index.astro`:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import Hero from "../components/Hero.astro";
import ChatDemo from "../components/ChatDemo.astro";
import AssistantSection from "../components/AssistantSection.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main>
    <Hero>
      <ChatDemo />
    </Hero>
    <AssistantSection />
  </main>
</Layout>
```

- [ ] **Step 3: Verify the section renders and cycles**

```bash
cd apps/landing && pnpm dev
```

Expected: Below the hero, a split section with text on the left (heading, description, prompt pills) and a cycling demo on the right. Examples auto-rotate every 4 seconds with a fade transition. Clicking dots jumps to that example.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add AI assistant deep-dive section with cycling demos"
```

---

## Task 7: Vault Showcase Section

**Files:**
- Create: `apps/landing/src/components/VaultSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create VaultSection.astro**

```astro
<section class="relative px-6 py-24 md:py-32">
  <div class="pointer-events-none absolute inset-0 bg-gradient-warm"></div>

  <div class="relative mx-auto max-w-6xl">
    <!-- Header -->
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-purple-400">Knowledge Vault</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-gradient">
        Save anything. From anywhere.
      </h2>
      <p class="mx-auto max-w-2xl text-lg text-muted-foreground">
        Articles, screenshots, videos, podcasts — MindTab's AI reads it all,
        extracts the key points, and makes it searchable.
      </p>
    </div>

    <!-- Three input methods -->
    <div class="mb-16 grid gap-6 sm:grid-cols-3 stagger-children">
      <!-- Mobile share sheet -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/20 p-6 text-center transition-all hover:border-amber-500/30 hover:bg-secondary/30">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20">
          <svg class="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
        </div>
        <h3 class="mb-2 text-lg font-semibold">Mobile Share Sheet</h3>
        <p class="text-sm text-muted-foreground">See something interesting? Share it directly to MindTab from any app.</p>
      </div>

      <!-- Chrome extension -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/20 p-6 text-center transition-all hover:border-purple-500/30 hover:bg-secondary/30">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20">
          <svg class="h-7 w-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
        </div>
        <h3 class="mb-2 text-lg font-semibold">Chrome Extension</h3>
        <p class="text-sm text-muted-foreground">One click to save any webpage. MindTab captures the content automatically.</p>
      </div>

      <!-- Web app -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/20 p-6 text-center transition-all hover:border-blue-500/30 hover:bg-secondary/30">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20">
          <svg class="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <h3 class="mb-2 text-lg font-semibold">Web App</h3>
        <p class="text-sm text-muted-foreground">Paste a URL, drop a screenshot, or upload a file. Any format works.</p>
      </div>
    </div>

    <!-- Processing animation -->
    <div class="animate-on-scroll">
      <div class="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border/50 bg-secondary/20">
        <div class="border-b border-border/50 px-4 py-2.5">
          <span class="text-xs text-muted-foreground">What happens when you save something</span>
        </div>

        <div class="p-6">
          <!-- Pipeline steps -->
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-0" id="vault-pipeline">
            <!-- Step 1: Content arrives -->
            <div class="vault-step flex-1 rounded-lg border border-border/50 bg-background/60 p-3 text-center opacity-0" data-step="0">
              <div class="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
                <svg class="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              </div>
              <p class="text-xs font-medium">Content In</p>
            </div>

            <!-- Arrow -->
            <div class="hidden px-2 text-muted-foreground/30 sm:block">→</div>

            <!-- Step 2: AI reads -->
            <div class="vault-step flex-1 rounded-lg border border-border/50 bg-background/60 p-3 text-center opacity-0" data-step="1">
              <div class="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
                <svg class="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
              <p class="text-xs font-medium">AI Reads</p>
            </div>

            <!-- Arrow -->
            <div class="hidden px-2 text-muted-foreground/30 sm:block">→</div>

            <!-- Step 3: Extract & summarize -->
            <div class="vault-step flex-1 rounded-lg border border-border/50 bg-background/60 p-3 text-center opacity-0" data-step="2">
              <div class="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
                <svg class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
              </div>
              <p class="text-xs font-medium">Summarize</p>
            </div>

            <!-- Arrow -->
            <div class="hidden px-2 text-muted-foreground/30 sm:block">→</div>

            <!-- Step 4: Tag & organize -->
            <div class="vault-step flex-1 rounded-lg border border-border/50 bg-background/60 p-3 text-center opacity-0" data-step="3">
              <div class="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
                <svg class="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
              </div>
              <p class="text-xs font-medium">Tag & Store</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<script>
  const pipeline = document.getElementById("vault-pipeline");
  if (pipeline) {
    const steps = pipeline.querySelectorAll(".vault-step");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            steps.forEach((step, i) => {
              setTimeout(() => {
                (step as HTMLElement).style.transition = "opacity 0.5s ease-out, transform 0.5s ease-out";
                (step as HTMLElement).style.transform = "translateY(0)";
                (step as HTMLElement).style.opacity = "1";
              }, i * 400);
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    // Set initial state
    steps.forEach((step) => {
      (step as HTMLElement).style.transform = "translateY(15px)";
    });

    observer.observe(pipeline);
  }
</script>
```

Write this to `apps/landing/src/components/VaultSection.astro`.

- [ ] **Step 2: Add section to index.astro**

Add the import and component to `apps/landing/src/pages/index.astro` after `AssistantSection`:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import Hero from "../components/Hero.astro";
import ChatDemo from "../components/ChatDemo.astro";
import AssistantSection from "../components/AssistantSection.astro";
import VaultSection from "../components/VaultSection.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main>
    <Hero>
      <ChatDemo />
    </Hero>
    <AssistantSection />
    <VaultSection />
  </main>
</Layout>
```

- [ ] **Step 3: Verify the vault section renders**

```bash
cd apps/landing && pnpm dev
```

Expected: Section with "Save anything. From anywhere." heading. Three cards for mobile/extension/web with hover effects. Below, a pipeline animation showing 4 steps (Content In → AI Reads → Summarize → Tag & Store) that animate in sequentially when scrolled into view.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add vault showcase section with processing pipeline animation"
```

---

## Task 8: Features Section (Goals, Habits, Journals)

**Files:**
- Create: `apps/landing/src/components/FeaturesSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create FeaturesSection.astro**

This section uses placeholder mockups built with HTML/CSS to simulate product screenshots. These will be replaced with real screenshots later.

```astro
<section class="px-6 py-24 md:py-32">
  <div class="mx-auto max-w-6xl">
    <!-- Header -->
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-green-400">Productivity</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-gradient">
        Everything you need to stay on track
      </h2>
    </div>

    <!-- Feature cards -->
    <div class="grid gap-8 md:grid-cols-3 stagger-children">
      <!-- Goals -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/10 overflow-hidden transition-all hover:border-amber-500/20">
        <!-- Mock screenshot -->
        <div class="border-b border-border/50 bg-background/50 p-4">
          <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div class="h-2 w-2 rounded-full bg-amber-400"></div>
            Goals — Kanban View
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="space-y-2">
              <div class="rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">To Do</div>
              <div class="rounded border border-border/50 bg-secondary/50 p-2">
                <div class="mb-1 h-1.5 w-3/4 rounded bg-muted-foreground/20"></div>
                <div class="h-1 w-1/2 rounded bg-muted-foreground/10"></div>
                <span class="mt-1 inline-block rounded bg-orange-500/20 px-1 text-[8px] text-orange-400">P1</span>
              </div>
              <div class="rounded border border-border/50 bg-secondary/50 p-2">
                <div class="mb-1 h-1.5 w-2/3 rounded bg-muted-foreground/20"></div>
                <div class="h-1 w-1/3 rounded bg-muted-foreground/10"></div>
                <span class="mt-1 inline-block rounded bg-blue-500/20 px-1 text-[8px] text-blue-400">P2</span>
              </div>
            </div>
            <div class="space-y-2">
              <div class="rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">In Progress</div>
              <div class="rounded border border-amber-500/20 bg-secondary/50 p-2">
                <div class="mb-1 h-1.5 w-full rounded bg-muted-foreground/20"></div>
                <div class="h-1 w-2/3 rounded bg-muted-foreground/10"></div>
                <span class="mt-1 inline-block rounded bg-red-500/20 px-1 text-[8px] text-red-400">P0</span>
              </div>
            </div>
            <div class="space-y-2">
              <div class="rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">Done</div>
              <div class="rounded border border-green-500/20 bg-secondary/50 p-2">
                <div class="mb-1 h-1.5 w-3/4 rounded bg-muted-foreground/20"></div>
                <div class="h-1 w-1/2 rounded bg-muted-foreground/10"></div>
                <span class="mt-1 inline-block rounded bg-green-500/20 px-1 text-[8px] text-green-400">✓</span>
              </div>
            </div>
          </div>
        </div>
        <div class="p-5">
          <h3 class="mb-2 text-lg font-semibold">Goals</h3>
          <p class="text-sm text-muted-foreground">Break down what matters. Track progress across projects with priorities and deadlines.</p>
        </div>
      </div>

      <!-- Habits -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/10 overflow-hidden transition-all hover:border-purple-500/20">
        <!-- Mock screenshot -->
        <div class="border-b border-border/50 bg-background/50 p-4">
          <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div class="h-2 w-2 rounded-full bg-purple-400"></div>
            Habits — Weekly View
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-16 truncate text-[10px]">Morning Run</span>
              <div class="flex gap-0.5">
                <div class="h-4 w-4 rounded-sm bg-green-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-green-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-green-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-green-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-green-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-muted/50"></div>
                <div class="h-4 w-4 rounded-sm bg-muted/50"></div>
              </div>
              <span class="text-[10px] text-green-400">🔥 12</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 truncate text-[10px]">Read</span>
              <div class="flex gap-0.5">
                <div class="h-4 w-4 rounded-sm bg-purple-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-purple-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-muted/50"></div>
                <div class="h-4 w-4 rounded-sm bg-purple-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-purple-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-purple-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-muted/50"></div>
              </div>
              <span class="text-[10px] text-purple-400">🔥 5</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 truncate text-[10px]">Meditate</span>
              <div class="flex gap-0.5">
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
                <div class="h-4 w-4 rounded-sm bg-amber-500/70"></div>
              </div>
              <span class="text-[10px] text-amber-400">🔥 30</span>
            </div>
          </div>
        </div>
        <div class="p-5">
          <h3 class="mb-2 text-lg font-semibold">Habits</h3>
          <p class="text-sm text-muted-foreground">Build consistency. Earn XP. Watch your streaks grow with visual tracking.</p>
        </div>
      </div>

      <!-- Journals -->
      <div class="animate-on-scroll group rounded-xl border border-border/50 bg-secondary/10 overflow-hidden transition-all hover:border-blue-500/20">
        <!-- Mock screenshot -->
        <div class="border-b border-border/50 bg-background/50 p-4">
          <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div class="h-2 w-2 rounded-full bg-blue-400"></div>
            Journal Entry
          </div>
          <div class="space-y-2">
            <div class="h-2 w-3/4 rounded bg-muted-foreground/20"></div>
            <div class="h-1.5 w-full rounded bg-muted-foreground/10"></div>
            <div class="h-1.5 w-full rounded bg-muted-foreground/10"></div>
            <div class="h-1.5 w-5/6 rounded bg-muted-foreground/10"></div>
            <div class="h-1.5 w-0 rounded bg-muted-foreground/10"></div>
            <div class="h-1.5 w-full rounded bg-muted-foreground/10"></div>
            <div class="h-1.5 w-2/3 rounded bg-muted-foreground/10"></div>
            <div class="mt-3 flex gap-1.5">
              <span class="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-400">Project: MindTab</span>
              <span class="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">Mar 26</span>
            </div>
          </div>
        </div>
        <div class="p-5">
          <h3 class="mb-2 text-lg font-semibold">Journals</h3>
          <p class="text-sm text-muted-foreground">Capture thoughts, tag them to projects, find them later with rich text editing.</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

Write this to `apps/landing/src/components/FeaturesSection.astro`.

- [ ] **Step 2: Add section to index.astro**

Add `import FeaturesSection from "../components/FeaturesSection.astro";` and `<FeaturesSection />` after `<VaultSection />` in `apps/landing/src/pages/index.astro`.

- [ ] **Step 3: Verify features section renders**

```bash
cd apps/landing && pnpm dev
```

Expected: Three cards in a row on desktop (stacked on mobile) with mock product screenshots showing kanban goals, habit grid with streaks, and journal entry. Cards have hover border effects. Sections fade in on scroll.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add features section with goals, habits, journals mockups"
```

---

## Task 9: Cross-Platform & How It Works Sections

**Files:**
- Create: `apps/landing/src/components/CrossPlatformSection.astro`
- Create: `apps/landing/src/components/HowItWorksSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create CrossPlatformSection.astro**

```astro
<section class="relative px-6 py-24 md:py-32 overflow-hidden">
  <div class="pointer-events-none absolute inset-0 bg-gradient-warm"></div>

  <div class="relative mx-auto max-w-6xl">
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-blue-400">Cross-Platform</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-gradient">
        Your brain, everywhere
      </h2>
      <p class="mx-auto max-w-xl text-lg text-muted-foreground">
        Web. Mobile. Chrome Extension. Your data syncs in real-time across every device.
      </p>
    </div>

    <!-- Device mockups -->
    <div class="relative flex items-center justify-center stagger-children" style="min-height: 320px;">
      <!-- Laptop -->
      <div class="animate-on-scroll relative z-10 w-full max-w-lg">
        <div class="rounded-xl border border-border/50 bg-secondary/30 p-1 shadow-2xl">
          <div class="rounded-lg bg-background p-3">
            <div class="mb-2 flex items-center gap-2">
              <div class="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-amber-400 to-purple-500">
                <span class="text-[8px] font-bold text-black">M</span>
              </div>
              <span class="text-[10px] font-medium">MindTab</span>
              <div class="ml-auto flex gap-1">
                <div class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30"></div>
                <div class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30"></div>
                <div class="h-1.5 w-1.5 rounded-full bg-muted-foreground/30"></div>
              </div>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <div class="col-span-2 space-y-1.5">
                <div class="h-1.5 w-3/4 rounded bg-muted-foreground/20"></div>
                <div class="rounded border border-border/30 bg-secondary/30 p-1.5">
                  <div class="h-1 w-full rounded bg-muted-foreground/15"></div>
                  <div class="mt-1 h-1 w-2/3 rounded bg-muted-foreground/10"></div>
                </div>
                <div class="rounded border border-border/30 bg-secondary/30 p-1.5">
                  <div class="h-1 w-full rounded bg-muted-foreground/15"></div>
                  <div class="mt-1 h-1 w-1/2 rounded bg-muted-foreground/10"></div>
                </div>
              </div>
              <div class="col-span-3 space-y-1.5">
                <div class="h-1.5 w-1/2 rounded bg-muted-foreground/20"></div>
                <div class="flex gap-1">
                  <div class="h-6 w-6 rounded bg-green-500/20"></div>
                  <div class="h-6 w-6 rounded bg-green-500/20"></div>
                  <div class="h-6 w-6 rounded bg-muted/30"></div>
                  <div class="h-6 w-6 rounded bg-green-500/20"></div>
                  <div class="h-6 w-6 rounded bg-muted/30"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Laptop base -->
        <div class="mx-auto h-2 w-1/3 rounded-b-lg bg-secondary/50"></div>
      </div>

      <!-- Phone (offset right) -->
      <div class="animate-on-scroll absolute -right-4 top-4 z-20 w-32 sm:right-8 md:right-16">
        <div class="rounded-2xl border border-border/50 bg-secondary/30 p-1 shadow-2xl">
          <div class="rounded-xl bg-background p-2">
            <div class="mb-2 flex items-center justify-center">
              <div class="h-1 w-8 rounded-full bg-muted-foreground/20"></div>
            </div>
            <div class="space-y-1.5">
              <div class="h-1 w-3/4 rounded bg-muted-foreground/20"></div>
              <div class="rounded border border-border/30 bg-secondary/30 p-1">
                <div class="h-0.5 w-full rounded bg-muted-foreground/15"></div>
                <div class="mt-0.5 h-0.5 w-1/2 rounded bg-muted-foreground/10"></div>
              </div>
              <div class="rounded border border-border/30 bg-secondary/30 p-1">
                <div class="h-0.5 w-full rounded bg-muted-foreground/15"></div>
                <div class="mt-0.5 h-0.5 w-2/3 rounded bg-muted-foreground/10"></div>
              </div>
              <div class="rounded border border-border/30 bg-secondary/30 p-1">
                <div class="h-0.5 w-3/4 rounded bg-muted-foreground/15"></div>
              </div>
            </div>
          </div>
        </div>
        <!-- Coming soon badge -->
        <div class="mt-2 rounded-full bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-500/30 px-2 py-0.5 text-center text-[9px] font-medium text-amber-300">
          Mobile — Coming Soon
        </div>
      </div>

      <!-- Browser extension (offset left) -->
      <div class="animate-on-scroll absolute -left-4 top-8 z-20 w-36 sm:left-4 md:left-12">
        <div class="rounded-lg border border-border/50 bg-secondary/30 p-1 shadow-2xl">
          <div class="rounded bg-background p-2">
            <div class="mb-1.5 flex items-center gap-1">
              <div class="h-1.5 w-1.5 rounded-full bg-red-400/60"></div>
              <div class="h-1.5 w-1.5 rounded-full bg-yellow-400/60"></div>
              <div class="h-1.5 w-1.5 rounded-full bg-green-400/60"></div>
              <div class="ml-1 h-1.5 flex-1 rounded bg-muted/30"></div>
            </div>
            <div class="space-y-1">
              <div class="h-1 w-full rounded bg-muted-foreground/15"></div>
              <div class="h-1 w-full rounded bg-muted-foreground/10"></div>
              <div class="mt-1.5 flex items-center gap-1">
                <div class="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-amber-400 to-purple-500">
                  <span class="text-[6px] font-bold text-black">M</span>
                </div>
                <span class="text-[8px] text-amber-400">Save to MindTab</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

Write this to `apps/landing/src/components/CrossPlatformSection.astro`.

- [ ] **Step 2: Create HowItWorksSection.astro**

```astro
<section class="px-6 py-24 md:py-32">
  <div class="mx-auto max-w-5xl">
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">Getting Started</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl text-gradient">
        How it works
      </h2>
    </div>

    <!-- Steps -->
    <div class="grid gap-8 sm:grid-cols-2 md:grid-cols-4 stagger-children">
      <div class="animate-on-scroll text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-lg font-bold text-black">
          1
        </div>
        <h3 class="mb-2 text-base font-semibold">Sign up</h3>
        <p class="text-sm text-muted-foreground">Create your free account with Google. Takes 5 seconds.</p>
      </div>

      <div class="animate-on-scroll text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-lg font-bold text-white">
          2
        </div>
        <h3 class="mb-2 text-base font-semibold">Save & organize</h3>
        <p class="text-sm text-muted-foreground">Drop articles, notes, and ideas into your vault from any device.</p>
      </div>

      <div class="animate-on-scroll text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-bold text-white">
          3
        </div>
        <h3 class="mb-2 text-base font-semibold">Let AI work</h3>
        <p class="text-sm text-muted-foreground">MindTab reads, summarizes, and connects your knowledge automatically.</p>
      </div>

      <div class="animate-on-scroll text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 text-lg font-bold text-white">
          4
        </div>
        <h3 class="mb-2 text-base font-semibold">Stay on track</h3>
        <p class="text-sm text-muted-foreground">Set goals, build habits, and ask your assistant anything.</p>
      </div>
    </div>
  </div>
</section>
```

Write this to `apps/landing/src/components/HowItWorksSection.astro`.

- [ ] **Step 3: Add both sections to index.astro**

Add imports and components after `<FeaturesSection />`:

```astro
import CrossPlatformSection from "../components/CrossPlatformSection.astro";
import HowItWorksSection from "../components/HowItWorksSection.astro";
```

```html
<CrossPlatformSection />
<HowItWorksSection />
```

- [ ] **Step 4: Verify both sections render**

```bash
cd apps/landing && pnpm dev
```

Expected: Cross-platform section shows overlapping device mockups (laptop center, phone right with "Coming Soon" badge, browser extension left). How It Works shows 4 numbered steps in a row with gradient circles and staggered scroll animations.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add cross-platform and how-it-works sections"
```

---

## Task 10: Pricing Section

**Files:**
- Create: `apps/landing/src/components/PricingSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create PricingSection.astro**

The Pro card is the hero — visually dominant with gradient border and "Most Popular" badge. Premium exists as a price anchor.

```astro
<section id="pricing" class="relative px-6 py-24 md:py-32">
  <div class="pointer-events-none absolute inset-0 bg-gradient-warm"></div>

  <div class="relative mx-auto max-w-5xl">
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-amber-400">Pricing</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-gradient">
        Start free. Upgrade when you're ready.
      </h2>
      <p class="text-lg text-muted-foreground">No credit card required. No time limits on the free plan.</p>
    </div>

    <div class="grid gap-6 md:grid-cols-3 stagger-children">
      <!-- Free tier -->
      <div class="animate-on-scroll flex flex-col rounded-xl border border-border/50 bg-secondary/10 p-6">
        <div class="mb-6">
          <h3 class="mb-1 text-lg font-semibold">Free</h3>
          <div class="flex items-baseline gap-1">
            <span class="text-4xl font-bold">$0</span>
            <span class="text-muted-foreground">/month</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">Get started and explore what MindTab can do.</p>
        </div>

        <ul class="mb-8 flex-1 space-y-3">
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Core goals, habits & journals
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            AI assistant (limited)
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Chrome extension
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Vault (limited saves)
          </li>
        </ul>

        <a
          href="https://app.mindtab.in"
          class="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-secondary/50 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Get Started Free
        </a>
      </div>

      <!-- Pro tier — THE HERO CARD -->
      <div class="animate-on-scroll relative flex flex-col rounded-xl p-6 md:-mt-4 md:mb-[-16px]"
           style="background: linear-gradient(var(--background), var(--background)) padding-box, linear-gradient(135deg, #fbbf24, #a855f7, #3b82f6) border-box; border: 2px solid transparent;">
        <!-- Most Popular badge -->
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-purple-500 px-4 py-1 text-xs font-semibold text-white shadow-lg">
          Most Popular
        </div>

        <div class="mb-6">
          <h3 class="mb-1 text-lg font-semibold">Pro</h3>
          <div class="flex items-baseline gap-1">
            <span class="text-4xl font-bold text-gradient-warm">$10</span>
            <span class="text-muted-foreground">/month</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">Unlock the full power of your second brain.</p>
        </div>

        <ul class="mb-8 flex-1 space-y-3">
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            <span><strong>Everything in Free</strong></span>
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            <strong>Unlimited</strong> vault saves
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            <strong>Full</strong> AI assistant — no limits
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Priority AI processing
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Advanced search & insights
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            All future features included
          </li>
        </ul>

        <a
          href="https://app.mindtab.in"
          class="inline-flex h-11 items-center justify-center rounded-lg bg-gradient-to-r from-amber-500 to-purple-500 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:brightness-110"
        >
          Go Pro
        </a>
      </div>

      <!-- Premium tier — price anchor -->
      <div class="animate-on-scroll flex flex-col rounded-xl border border-border/50 bg-secondary/10 p-6">
        <div class="mb-6">
          <h3 class="mb-1 text-lg font-semibold">Premium</h3>
          <div class="flex items-baseline gap-1">
            <span class="text-4xl font-bold">$99</span>
            <span class="text-muted-foreground">/month</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">For power users who want the white-glove experience.</p>
        </div>

        <ul class="mb-8 flex-1 space-y-3">
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            <span><strong>Everything in Pro</strong></span>
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Priority support — 24hr max response from founder
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            White-glove data import: Notion, Linear, Obsidian, Safari, Chrome & more
          </li>
          <li class="flex items-start gap-2 text-sm">
            <svg class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Dedicated onboarding assistance
          </li>
        </ul>

        <a
          href="https://app.mindtab.in"
          class="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-secondary/50 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Go Premium
        </a>
      </div>
    </div>
  </div>
</section>
```

Write this to `apps/landing/src/components/PricingSection.astro`.

- [ ] **Step 2: Add section to index.astro**

Add `import PricingSection from "../components/PricingSection.astro";` and `<PricingSection />` after `<HowItWorksSection />`.

- [ ] **Step 3: Verify pricing renders correctly**

```bash
cd apps/landing && pnpm dev
```

Expected: Three pricing cards. The Pro card is visually dominant — gradient border (amber → purple → blue), "Most Popular" badge floating above, gradient CTA button matching the hero. Free and Premium are more subdued. Pro card is slightly taller than the others on desktop (negative margin trick).

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add pricing section with anchor pricing strategy"
```

---

## Task 11: FAQ Section

**Files:**
- Create: `apps/landing/src/components/FAQSection.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create FAQSection.astro**

```astro
---
const faqs = [
  {
    question: "What is MindTab?",
    answer: "MindTab is your AI-powered second brain. It combines goal tracking, habit building, journaling, and a knowledge vault with an intelligent AI assistant that actually understands your data and can take actions for you.",
  },
  {
    question: "How does the AI assistant work?",
    answer: "Unlike generic chatbots, MindTab's assistant has full context about your goals, habits, saved articles, and notes. You can ask it anything — from \"What did that article say about scaling?\" to \"Mark my morning run as done\" — and it acts on your data directly.",
  },
  {
    question: "What can I save to the vault?",
    answer: "Anything. Articles, blog posts, YouTube videos, podcasts, screenshots, PDFs, tweets — save from your phone's share sheet, the Chrome extension, or paste directly in the web app. MindTab's AI reads, extracts, summarizes, and tags everything automatically.",
  },
  {
    question: "Is my data private and secure?",
    answer: "Yes. Your data is stored securely and is only accessible to you. We use industry-standard encryption and never share your personal data with third parties. Your knowledge vault is yours alone.",
  },
  {
    question: "What platforms is MindTab available on?",
    answer: "MindTab is available as a web app (app.mindtab.in), a Chrome extension, and a mobile app (coming soon to iOS and Android). Your data syncs in real-time across all platforms.",
  },
  {
    question: "How do I import data from Notion, Obsidian, or other tools?",
    answer: "Premium plan subscribers get white-glove data import — we'll personally help you migrate your data from Notion, Linear, Obsidian, Safari bookmarks, Chrome reading list, and more. Just reach out after subscribing and we'll handle it.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Absolutely. No contracts, no commitments. You can cancel your subscription at any time and continue using the free plan. Your data stays yours regardless.",
  },
];
---

<section id="faq" class="px-6 py-24 md:py-32">
  <div class="mx-auto max-w-3xl">
    <div class="mb-16 text-center animate-on-scroll">
      <p class="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">FAQ</p>
      <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl text-gradient">
        Frequently asked questions
      </h2>
    </div>

    <div class="space-y-3 animate-on-scroll" id="faq-list">
      {faqs.map((faq, i) => (
        <div class="faq-item rounded-lg border border-border/50 bg-secondary/10 transition-colors hover:bg-secondary/20">
          <button
            class="faq-trigger flex w-full items-center justify-between px-5 py-4 text-left"
            data-index={i}
          >
            <span class="pr-4 text-sm font-medium">{faq.question}</span>
            <svg
              class="faq-chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div class="faq-content overflow-hidden" style="max-height: 0; opacity: 0; transition: max-height 0.3s ease-out, opacity 0.2s ease-out;">
            <p class="px-5 pb-4 text-sm text-muted-foreground">{faq.answer}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>

<script>
  document.querySelectorAll(".faq-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const item = trigger.closest(".faq-item")!;
      const content = item.querySelector(".faq-content") as HTMLElement;
      const chevron = item.querySelector(".faq-chevron") as HTMLElement;
      const isOpen = content.style.maxHeight !== "0px" && content.style.maxHeight !== "";

      // Close all others
      document.querySelectorAll(".faq-item").forEach((other) => {
        if (other !== item) {
          const otherContent = other.querySelector(".faq-content") as HTMLElement;
          const otherChevron = other.querySelector(".faq-chevron") as HTMLElement;
          otherContent.style.maxHeight = "0px";
          otherContent.style.opacity = "0";
          otherChevron.style.transform = "rotate(0deg)";
        }
      });

      // Toggle current
      if (isOpen) {
        content.style.maxHeight = "0px";
        content.style.opacity = "0";
        chevron.style.transform = "rotate(0deg)";
      } else {
        content.style.maxHeight = content.scrollHeight + "px";
        content.style.opacity = "1";
        chevron.style.transform = "rotate(180deg)";
      }
    });
  });
</script>
```

Write this to `apps/landing/src/components/FAQSection.astro`.

- [ ] **Step 2: Add section to index.astro**

Add `import FAQSection from "../components/FAQSection.astro";` and `<FAQSection />` after `<PricingSection />`.

- [ ] **Step 3: Verify FAQ accordion works**

```bash
cd apps/landing && pnpm dev
```

Expected: 7 FAQ items in a centered column. Clicking a question expands the answer with a smooth slide-down animation and rotates the chevron. Clicking another question closes the current one and opens the new one.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add FAQ section with accordion"
```

---

## Task 12: Footer CTA & Footer

**Files:**
- Create: `apps/landing/src/components/FooterCTA.astro`
- Create: `apps/landing/src/components/Footer.astro`
- Modify: `apps/landing/src/pages/index.astro`

- [ ] **Step 1: Create FooterCTA.astro**

```astro
<section class="px-6 py-24 md:py-32">
  <div class="mx-auto max-w-4xl">
    <div class="relative overflow-hidden rounded-2xl border border-amber-500/20 p-8 text-center sm:p-12 md:p-16">
      <!-- Gradient background -->
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-blue-500/10"></div>
      <div class="pointer-events-none absolute inset-0 bg-gradient-warm-intense"></div>

      <div class="relative z-10">
        <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          <span class="text-gradient-warm">Ready to build your</span>
          <br />
          <span class="text-gradient">second brain?</span>
        </h2>
        <p class="mx-auto mb-8 max-w-lg text-lg text-muted-foreground">
          Join thousands of people who think clearer, save smarter, and get more done with MindTab.
        </p>
        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="https://app.mindtab.in"
            class="inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-amber-500 to-purple-500 px-8 text-base font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:brightness-110"
          >
            Get Started Free
          </a>
          <a
            href="#pricing"
            class="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-secondary/50 px-8 text-base font-medium transition-colors hover:bg-secondary"
          >
            View Pricing
          </a>
        </div>
      </div>
    </div>
  </div>
</section>
```

Write this to `apps/landing/src/components/FooterCTA.astro`.

- [ ] **Step 2: Create Footer.astro**

```astro
---
const currentYear = new Date().getFullYear();
---

<footer class="border-t border-border/50 px-6 py-12">
  <div class="mx-auto max-w-6xl">
    <div class="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
      <!-- Brand -->
      <div class="sm:col-span-2 md:col-span-1">
        <a href="/" class="mb-4 flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-purple-500">
            <span class="text-sm font-bold text-black">M</span>
          </div>
          <span class="text-lg font-semibold">MindTab</span>
        </a>
        <p class="text-sm text-muted-foreground">Your second brain that actually does things.</p>
      </div>

      <!-- Product -->
      <div>
        <h4 class="mb-3 text-sm font-semibold">Product</h4>
        <ul class="space-y-2">
          <li><a href="#features" class="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a></li>
          <li><a href="#pricing" class="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a></li>
          <li><a href="#faq" class="text-sm text-muted-foreground transition-colors hover:text-foreground">FAQ</a></li>
          <li>
            <a href="https://chromewebstore.google.com/detail/mindtab/ndnegdefonikfckhbgmejdodebnbhjll" class="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Chrome Extension
            </a>
          </li>
        </ul>
      </div>

      <!-- Links -->
      <div>
        <h4 class="mb-3 text-sm font-semibold">Links</h4>
        <ul class="space-y-2">
          <li><a href="https://app.mindtab.in" class="text-sm text-muted-foreground transition-colors hover:text-foreground">Web App</a></li>
          <li><a href="https://github.com/ksushant6566/MindTab" class="text-sm text-muted-foreground transition-colors hover:text-foreground">GitHub</a></li>
        </ul>
      </div>

      <!-- Legal -->
      <div>
        <h4 class="mb-3 text-sm font-semibold">Legal</h4>
        <ul class="space-y-2">
          <li><a href="/privacy" class="text-sm text-muted-foreground transition-colors hover:text-foreground">Privacy Policy</a></li>
          <li><a href="/terms" class="text-sm text-muted-foreground transition-colors hover:text-foreground">Terms of Service</a></li>
        </ul>
      </div>
    </div>

    <div class="mt-10 border-t border-border/50 pt-6 text-center">
      <p class="text-xs text-muted-foreground">&copy; {currentYear} MindTab. All rights reserved.</p>
    </div>
  </div>
</footer>
```

Write this to `apps/landing/src/components/Footer.astro`.

- [ ] **Step 3: Add both to index.astro — final assembly**

Update `apps/landing/src/pages/index.astro` to its final form:

```astro
---
import Layout from "../layouts/Layout.astro";
import Navbar from "../components/Navbar.astro";
import Hero from "../components/Hero.astro";
import ChatDemo from "../components/ChatDemo.astro";
import AssistantSection from "../components/AssistantSection.astro";
import VaultSection from "../components/VaultSection.astro";
import FeaturesSection from "../components/FeaturesSection.astro";
import CrossPlatformSection from "../components/CrossPlatformSection.astro";
import HowItWorksSection from "../components/HowItWorksSection.astro";
import PricingSection from "../components/PricingSection.astro";
import FAQSection from "../components/FAQSection.astro";
import FooterCTA from "../components/FooterCTA.astro";
import Footer from "../components/Footer.astro";
import "../styles/globals.css";
---

<Layout>
  <Navbar />
  <main>
    <Hero>
      <ChatDemo />
    </Hero>
    <AssistantSection />
    <VaultSection />
    <FeaturesSection />
    <CrossPlatformSection />
    <HowItWorksSection />
    <PricingSection />
    <FAQSection />
    <FooterCTA />
  </main>
  <Footer />
</Layout>
```

- [ ] **Step 4: Verify the full page**

```bash
cd apps/landing && pnpm dev
```

Expected: Complete landing page with all 9 sections flowing top to bottom. Scroll animations fire as sections enter the viewport. Nav links scroll smoothly to their targets. All interactive elements work (chat demo, cycling examples, vault pipeline, FAQ accordion, mobile menu).

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/
git commit -m "feat(landing): add footer CTA, footer, and complete page assembly"
```

---

## Task 13: Production Polish

**Files:**
- Modify: `apps/landing/src/layouts/Layout.astro`
- Modify: `apps/landing/src/components/Navbar.astro`
- Create: `apps/landing/public/images/.gitkeep`

- [ ] **Step 1: Add favicon and additional meta tags**

In `apps/landing/src/layouts/Layout.astro`, add inside `<head>` after the existing meta tags:

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='url(%23g)'/><defs><linearGradient id='g' x1='0' y1='0' x2='32' y2='32'><stop stop-color='%23fbbf24'/><stop offset='1' stop-color='%23a855f7'/></linearGradient></defs><text x='50%25' y='58%25' dominant-baseline='middle' text-anchor='middle' font-size='18' font-weight='bold' fill='black'>M</text></svg>" />
<meta name="theme-color" content="#0a0a0a" />
<meta property="og:site_name" content="MindTab" />
<meta property="og:image" content="https://mindtab.in/og-image.png" />
<meta name="twitter:image" content="https://mindtab.in/og-image.png" />
```

- [ ] **Step 2: Add active state to navbar scroll**

Add this script at the bottom of `apps/landing/src/components/Navbar.astro`, replacing the existing script:

```html
<script>
  const btn = document.getElementById("mobile-menu-btn")!;
  const menu = document.getElementById("mobile-menu")!;
  const menuIcon = document.getElementById("menu-icon")!;
  const closeIcon = document.getElementById("close-icon")!;
  const nav = document.querySelector("nav")!;

  // Mobile menu toggle
  btn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
    menuIcon.classList.toggle("hidden");
    closeIcon.classList.toggle("hidden");
  });

  document.querySelectorAll(".mobile-nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.add("hidden");
      menuIcon.classList.remove("hidden");
      closeIcon.classList.add("hidden");
    });
  });

  // Add stronger background on scroll
  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      nav.classList.add("bg-background/95");
      nav.classList.remove("bg-background/80");
    } else {
      nav.classList.remove("bg-background/95");
      nav.classList.add("bg-background/80");
    }
  });
</script>
```

- [ ] **Step 3: Create images directory placeholder**

```bash
mkdir -p apps/landing/public/images
touch apps/landing/public/images/.gitkeep
```

- [ ] **Step 4: Verify everything works end-to-end**

```bash
cd apps/landing && pnpm build
```

Expected: Build succeeds with zero errors. Static output in `apps/landing/dist/`.

```bash
cd apps/landing && pnpm preview
```

Expected: Preview server starts, page loads with all sections, animations, and interactions working.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/
git commit -m "feat(landing): add production polish — favicon, meta tags, scroll behavior"
```

---

## Task 14: Root Workspace Integration

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add landing scripts to root package.json**

Add these scripts to the root `package.json`:

```json
"dev:landing": "pnpm --filter @mindtab/landing dev",
"build:landing": "pnpm --filter @mindtab/landing build"
```

- [ ] **Step 2: Verify workspace integration**

```bash
pnpm dev:landing
```

Expected: Astro dev server starts on port 3000 via the root workspace command.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add landing page scripts to root workspace"
```
