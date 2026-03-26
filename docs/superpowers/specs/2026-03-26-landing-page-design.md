# MindTab Landing Page — Design Spec

## Overview

A high-energy, dark-themed landing page for MindTab (www.mindtab.in) that lets visitors **experience the product**, not just read about it. Built with Astro, designed for launch timing alongside the mobile app release.

**Primary goal:** Convert visitors to sign-ups, with the $10/month Pro plan as the target conversion.

**Design direction:** Dark theme with bold, warm visuals — rich gradients (ambers, purples, soft oranges), animated elements that feel alive and inviting. Think Supabase energy with warmth, not coldness.

**Product showcase approach:** Hybrid — interactive AI assistant demo in the hero (the "dub.co moment"), animated demos for vault/AI features, static polished screenshots for goals/habits/journals.

**Tech stack:** Astro (as specified in CLAUDE.md for the landing app). Tailwind CSS for styling, reusing the existing design tokens (Geist font, HSL color variables). CSS/JS animations for demos.

---

## Page Structure

### Section 1: Hero

**Layout:** Full viewport height, centered content.

**Nav bar:** Minimal — Logo | Features | Pricing | Sign In

**Headline:** "Your second brain that actually does things" (or refined variant)

**Subtext:** One line explaining the product — something like "Track goals, build habits, save knowledge — and let AI handle the rest."

**Interactive demo:** A chat-style AI assistant simulation, centered below the headline. An animated conversation plays out automatically:
- User message types in: "Save this article about React Server Components and add it to my frontend project"
- Assistant responds: "Done. I've saved the article, extracted key points, and tagged it under your Frontend Research project."
- A mini vault card animates in showing the saved article with auto-generated tags

The demo should feel like watching the real product — not a fake marketing animation. Use the actual product's visual language (card styles, colors, typography).

**CTAs:** Two buttons below the demo — "Get Started Free" + "Get Chrome Extension"

**Visual feel:** Dark background with warm gradient glows behind the demo area. The chat simulation has a subtle glowing border to draw attention.

---

### Section 2: AI Assistant Deep-Dive

**Purpose:** Expand on the assistant as the #1 feature. This is what differentiates MindTab.

**Layout:** Split section — text/heading on one side, animated demo on the other.

**Heading:** "Just say what you want. It handles the rest."

**Animated examples** that cycle automatically with a few seconds between each:
1. "Mark my morning run habit as done" → habit gets checked, streak counter increments
2. "What did that article about microservices say about scaling?" → assistant pulls from vault, shows summary
3. "Create a goal to finish the landing page by Friday" → goal card appears with priority and deadline
4. "How am I doing on my habits this week?" → mini stats/chart renders

Each interaction shows the user request and the visual result. Auto-cycles but could have manual controls.

**Callout text:** "Not a generic chatbot. It knows your goals, your habits, your saved content."

**Visual feel:** Warm glow animations when results appear. The cycling keeps the section alive without requiring interaction.

---

### Section 3: Vault — "Save Anything, From Anywhere"

**Purpose:** Show how content enters MindTab and what AI does with it.

**Layout:** Three-column showcase for input methods, followed by a processing animation.

**Heading:** "Save anything. From anywhere."

**Three input methods** shown side by side:
1. **Mobile share sheet** — phone mockup showing sharing an article to MindTab
2. **Chrome extension** — browser mockup with one-click save button
3. **Web app** — paste a URL or drop a screenshot

**Processing animation** below: Content flows in → AI reads it → text extracted → summary appears → tags auto-generate → lands in vault, organized. This is a key "wow moment."

**Callout:** "Articles, screenshots, videos, podcasts — MindTab's AI reads it all, extracts the key points, and makes it searchable."

**Visual feel:** Input method cards have subtle floating/breathing animations. The processing sequence is smooth and satisfying — content transforming from raw to organized.

---

### Section 4: Goals, Habits & Journals

**Purpose:** Show the structured productivity system. Important but not the lead — the "engine room."

**Layout:** Stacked or tabbed, each with a polished product screenshot and brief copy.

**Heading:** "Everything you need to stay on track"

**Goals:**
- Screenshot of kanban view with projects, priorities (P1-P4), status tracking
- Copy: "Break down what matters. Track progress across projects."

**Habits:**
- Screenshot of habit grid with streaks and completion rings
- Copy: "Build consistency. Earn XP. Watch your streaks grow."

**Journals:**
- Screenshot of editor with a note
- Copy: "Capture thoughts, tag them to projects, find them later."

**Visual feel:** Static product screenshots in device frames with warm glows/shadows. Subtle scroll-triggered fade-in animations. Intentionally calmer than sections 2-3 — gives the eye a rest.

---

### Section 5: Cross-Platform — "Your Brain, Everywhere"

**Purpose:** Show MindTab works everywhere, tease mobile launch.

**Layout:** Centered device spread.

**Heading:** "Your brain, everywhere"

**Device mockups:** Laptop (web app), phone (mobile app), browser window (Chrome extension) — all showing MindTab, angled and overlapping slightly.

**Copy:** "Web. Mobile. Chrome Extension. Your data syncs in real-time across every device."

**Mobile badge:** "Coming soon" on the phone mockup, swappable to App Store / Play Store badges once live.

**Visual feel:** Devices float in with staggered entrance animation on scroll. Warm ambient glow behind the device cluster.

---

### Section 6: How It Works

**Purpose:** Quick-reference flow for the "just tell me what to do" visitors.

**Layout:** Horizontal 4-step flow with numbered circles and connecting lines.

**Steps:**
1. **Sign up** — "Create your free account with Google"
2. **Save & organize** — "Drop articles, notes, and ideas into your vault"
3. **Let AI work** — "MindTab reads, summarizes, and connects your knowledge"
4. **Stay on track** — "Set goals, build habits, and ask your assistant anything"

**Visual feel:** Clean, minimal. Each step fades in sequentially on scroll. Warm accent colors on step numbers.

---

### Section 7: Pricing

**Purpose:** Convert. The $10/month Pro plan is the target.

**Layout:** Three-column card layout.

**Pricing strategy:** The $99/month Premium tier is a price anchor — it exists to make the $10/month Pro plan feel like a no-brainer. The visual design must reflect this.

**Free — $0/month**
- Minimal card styling, clearly a starter tier
- Core goals, habits & journals
- AI assistant (limited)
- Chrome extension
- Vault (limited saves)
- CTA: "Get Started Free"

**Pro — $10/month** ⭐ THE HERO CARD
- Visually dominant: elevated, "Most Popular" badge, warm gradient border
- Everything in Free
- Unlimited vault saves
- Full AI assistant capabilities
- Priority processing
- The feature list should feel generous — like $99 worth of product for $10
- CTA: "Go Pro"

**Premium — $99/month**
- Styled well but not the star
- Everything in Pro
- Priority support (24hr max response time, direct from founder)
- White-glove data import: Notion, Linear, Obsidian, Safari bookmarks, Chrome reading list
- Dedicated onboarding assistance
- CTA: "Go Premium"

Note: Exact feature splits between Free and Pro tiers to be finalized during implementation. The above is directional.

---

### Section 8: FAQ

**Layout:** Accordion-style expandable questions, centered column, max-width for readability.

**Questions:**
- What is MindTab?
- How does the AI assistant work?
- What can I save to the vault?
- Is my data private and secure?
- What platforms is MindTab available on?
- How do I import my data from Notion / Obsidian / etc.?
- Can I cancel anytime?

Answers to be written during implementation.

---

### Section 9: Footer CTA + Footer

**Final CTA block:** Full-width section with warm gradient background. Heading: "Ready to build your second brain?" + "Get Started Free" button. Last push to convert.

**Footer:** Logo, nav links (Features, Pricing, GitHub, Chrome Extension), social links, copyright. Standard dark footer.

---

## Technical Decisions

**Framework:** Astro — as specified in CLAUDE.md for the `apps/landing/` workspace. Astro is ideal for a landing page: static-first with islands of interactivity for the animated demos.

**Styling:** Tailwind CSS, reusing existing design tokens from the web app:
- Font: Geist Sans (variable weight)
- Color system: HSL variables from the existing theme
- Dark mode as default (matches the product)

**Animations:**
- CSS animations for simpler effects (fade-ins, floating, glows)
- Vanilla JS or a lightweight library for the AI assistant chat simulation and vault processing animation
- Scroll-triggered animations via Intersection Observer
- No heavy animation libraries — keep the page fast

**Responsive:** Mobile-first. The page must look great on phones (especially since the user is targeting mobile app launch). Hero demo should adapt to smaller screens.

**Performance:** Static HTML output from Astro. Minimal JS. Fast load times are critical for a landing page — aim for 95+ Lighthouse score.

**Deployment:** www.mindtab.in (as per CLAUDE.md domain mapping)

---

## Out of Scope

- User authentication on the landing page itself (sign-in links to app.mindtab.in)
- Blog / changelog
- Internationalization
- A/B testing infrastructure
- Analytics (can be added later)
- Actual working AI demo (the hero demo is a simulation, not connected to the real API)
