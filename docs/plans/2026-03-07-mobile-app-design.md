# MindTab Mobile App Design

**Date:** 2026-03-07
**Status:** Approved

## Goal

Build a mobile app (iOS + Android) for MindTab using Expo React Native, sharing the existing Go API and monorepo packages. Focus on daily-driver use cases: habit tracking, quick journal entries, goal status updates, projects, and command palette. Skip kanban and drag-and-drop for v1.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Expo SDK 52+ with dev client | Need native modules (secure store, WebView for editor) |
| Navigation | Expo Router (file-based) | Built on React Navigation, same mental model as TanStack Router |
| Styling | NativeWind v4 | Reuse Tailwind classes and color tokens from web |
| State | Zustand (from `packages/core`) | Shared store across web + mobile |
| Data fetching | TanStack Query | Same patterns as web, hooks shared via `packages/core` |
| API client | openapi-fetch (from `packages/api-spec`) | Same typed client as web |
| Auth | `@react-native-google-signin` + JWT | Token in `expo-secure-store` |
| Rich text | `@10play/tentap-editor` | TipTap wrapper for RN, HTML-compatible with web |
| Offline cache | TanStack Query + MMKV persister | Read-only offline, mutations require connection |
| Animations | `react-native-reanimated` | Transitions, confetti, XP animations |
| Haptics | `expo-haptics` | Feedback on habit check/uncheck |
| Platforms | iOS + Android | Both from day one |
| Design language | Hybrid | Web's visual identity (dark theme, colors, cards) + native navigation patterns |

## Auth Flow

The web app uses httpOnly cookies for refresh tokens, which don't work in React Native. Solution:

1. Mobile sends `X-Platform: mobile` header on auth requests
2. Go backend returns `refreshToken` in the JSON response body (instead of cookie) when this header is present
3. Mobile stores both `accessToken` and `refreshToken` in `expo-secure-store`
4. `/auth/refresh` accepts refresh token in request body (mobile) OR cookie (web)
5. On 401 → attempt refresh → on failure → redirect to login

**Backend changes required:**
- `POST /auth/google`: return `refreshToken` in body when `X-Platform: mobile`
- `POST /auth/refresh`: accept `refreshToken` in body OR cookie

## Navigation Structure

```
Bottom Tabs:
├── Goals (list icon)
│   ├── Goals List (filterable by project)
│   ├── Goal Detail / Edit
│   └── Create Goal (modal)
├── Habits (check-square icon)
│   ├── Habits List (today's view + weekly grid)
│   ├── Habit Detail / Edit
│   └── Create Habit (modal)
├── Notes (edit-3 icon)
│   ├── Notes List (filterable by project)
│   ├── Note Detail (read mode)
│   ├── Note Edit (TipTap editor)
│   └── Create Note (modal)
└── Projects (folder icon)
    ├── Projects List
    ├── Project Detail (goals + journals within)
    ├── Create Project (modal)
    └── Edit Project (modal)

Global:
├── Header: avatar → profile/settings, search icon → command palette
├── Command Palette: full-screen modal search
├── Profile/Settings: XP, streak, logout
└── Onboarding: shown on first login
```

- Stack navigation within each tab
- Modals for create/edit (slide up from bottom)
- Command palette as full-screen overlay
- Swipe-back on both platforms

## Data Flow & Offline

**Online:** Same as web — Component → useQuery → openapi-fetch → Go API

**Offline (read-only):**
- Query cache persisted to MMKV (fast native key-value store)
- On launch, hydrate cache before network requests
- Offline mutations show toast: "You're offline"
- No mutation queue or conflict resolution in v1

**Cache strategy:**
- `staleTime`: 5 minutes (longer than web, reduce mobile network calls)
- Pull-to-refresh on all list screens
- Optimistic updates for habit tracking and goal status changes

## Feature Scope — v1

**Included:**
- Auth (Google Sign-In + JWT + secure storage)
- Onboarding flow
- Goals: list view, CRUD, status updates, project filter
- Habits: today's checklist + weekly grid, check/uncheck with haptics + confetti
- Notes: list, CRUD with rich text (tentap-editor), project filter
- Projects: list, CRUD, view goals + journals within
- Command palette (search goals, habits, notes)
- XP & streaks display, +10 XP animation
- Offline reading (cached data)
- Pull-to-refresh

**Excluded from v1:**
- Kanban board
- Drag-and-drop reordering
- Public profile pages
- Bookmarks/reading list sync (Chrome-specific)
- Push notifications
- Home screen widgets
- Deep linking

## Project Structure

```
apps/mobile/
├── app/                          # Expo Router (file-based routing)
│   ├── _layout.tsx               # Root layout: providers, auth guard
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   ├── (onboarding)/
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tab navigator
│   │   ├── goals/
│   │   │   ├── index.tsx
│   │   │   └── [id].tsx
│   │   ├── habits/
│   │   │   ├── index.tsx
│   │   │   └── [id].tsx
│   │   ├── notes/
│   │   │   ├── index.tsx
│   │   │   ├── [id].tsx
│   │   │   └── edit/[id].tsx
│   │   └── projects/
│   │       ├── index.tsx
│   │       └── [id].tsx
│   └── (modals)/
│       ├── create-goal.tsx
│       ├── create-habit.tsx
│       ├── create-note.tsx
│       ├── create-project.tsx
│       └── command-palette.tsx
├── components/
│   ├── ui/                       # Base: Button, Input, Card, etc.
│   ├── goals/
│   ├── habits/
│   ├── notes/
│   └── projects/
├── lib/
│   ├── auth.ts                   # expo-secure-store token management
│   ├── api-client.ts             # openapi-fetch with auth headers
│   └── utils.ts
├── styles/
│   └── colors.ts                 # Tailwind tokens matching web
├── app.json
├── babel.config.js
├── metro.config.js               # NativeWind + monorepo support
├── nativewind-env.d.ts
├── tailwind.config.ts            # Extends web's theme
├── tsconfig.json
└── package.json
```

## Shared Package Changes

Move API hooks from `apps/web/src/api/hooks/` to `packages/core/src/hooks/` so both web and mobile share them:

- `use-goals.ts`, `use-habits.ts`, `use-journals.ts`, `use-projects.ts`, `use-activity.ts`, `use-search.ts`
- Each hook takes an API client instance as parameter (different auth on web vs mobile)
- Web imports change: `~/api/hooks` → `@mindtab/core`
- `use-auth.ts` stays app-specific (different auth mechanisms)

## Backend Changes

1. **Auth endpoints:** Accept `X-Platform: mobile` header, return refresh token in body
2. **CORS:** Allow mobile dev origins (Expo dev server)
3. No other API changes needed — mobile uses same endpoints as web
