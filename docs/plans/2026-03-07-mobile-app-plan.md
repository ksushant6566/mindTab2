# MindTab Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Expo React Native mobile app (iOS + Android) that shares the Go API and monorepo packages, covering habit tracking, goals, journals, projects, and command palette.

**Architecture:** Expo dev client with Expo Router for file-based navigation. NativeWind v4 for Tailwind styling. TanStack Query hooks shared via `packages/core`. Auth via Google Sign-In + JWT stored in expo-secure-store. Rich text via `@10play/tentap-editor`. Offline read cache via MMKV.

**Tech Stack:** Expo SDK 52+, Expo Router, NativeWind v4, TanStack Query, openapi-fetch, Zustand, react-native-reanimated, expo-secure-store, @10play/tentap-editor, react-native-mmkv

**Design doc:** `docs/plans/2026-03-07-mobile-app-design.md`

---

## Phase 1: Scaffold & Infrastructure

### Task 1: Initialize Expo app in monorepo

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/.gitignore`
- Modify: `pnpm-workspace.yaml` (already includes `apps/*`, so no change needed)

**Step 1: Create the Expo app**

```bash
cd ~/Desktop/NovaProjecta/mindtab-v2
npx create-expo-app@latest apps/mobile --template blank-typescript
```

**Step 2: Update `apps/mobile/package.json`**

Rename to `@mindtab/mobile` and add workspace dependencies:

```json
{
  "name": "@mindtab/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start --dev-client",
    "build:ios": "eas build --platform ios",
    "build:android": "eas build --platform android",
    "prebuild": "expo prebuild",
    "lint": "tsc --noEmit",
    "clean": "rm -rf node_modules .expo dist"
  },
  "dependencies": {
    "@mindtab/api-spec": "workspace:*",
    "@mindtab/shared": "workspace:*",
    "@mindtab/core": "workspace:*",
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-haptics": "~14.0.0",
    "expo-dev-client": "~5.0.0",
    "expo-linking": "~7.0.0",
    "expo-constants": "~17.0.0",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-screens": "~4.4.0",
    "react-native-safe-area-context": "~4.14.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-web": "~0.19.0",
    "@react-native-google-signin/google-signin": "^13.0.0",
    "@10play/tentap-editor": "^0.5.0",
    "@tanstack/react-query": "^5.59.0",
    "openapi-fetch": "^0.13.5",
    "nativewind": "^4.1.0",
    "react-native-mmkv": "^3.2.0",
    "zustand": "^5.0.8",
    "lucide-react-native": "^0.438.0",
    "sonner-native": "^0.14.0",
    "react-native-svg": "~15.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "typescript": "^5.5.3",
    "tailwindcss": "^3.4.3"
  }
}
```

**Step 3: Create `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "MindTab",
    "slug": "mindtab",
    "version": "1.0.0",
    "scheme": "mindtab",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "backgroundColor": "#0a0a0a"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "in.mindtab.app",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#0a0a0a"
      },
      "package": "in.mindtab.app",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "@react-native-google-signin/google-signin",
        { "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID" }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

**Step 4: Create `apps/mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

**Step 5: Create `apps/mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      "react-native-reanimated/plugin",
    ],
  };
};
```

**Step 6: Create `apps/mobile/metro.config.js`**

This is critical for monorepo support — Metro needs to resolve packages from the workspace root.

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Resolve modules from both project and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/styles/globals.css" });
```

**Step 7: Create `apps/mobile/.gitignore`**

```gitignore
node_modules/
.expo/
dist/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
ios/
android/
```

**Step 8: Create assets directory**

```bash
mkdir -p apps/mobile/assets
# Copy or create placeholder icon.png and splash files
```

**Step 9: Commit**

```bash
git add apps/mobile/
git commit -m "chore: scaffold Expo app in monorepo"
```

---

### Task 2: Set up NativeWind and Tailwind theme

**Files:**
- Create: `apps/mobile/tailwind.config.ts`
- Create: `apps/mobile/nativewind-env.d.ts`
- Create: `apps/mobile/src/styles/globals.css`
- Create: `apps/mobile/src/styles/colors.ts`

**Step 1: Create `apps/mobile/tailwind.config.ts`**

Reuse the same color tokens as the web app:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
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
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
```

**Step 2: Create `apps/mobile/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

**Step 3: Create `apps/mobile/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
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
}
```

**Step 4: Create `apps/mobile/src/styles/colors.ts`**

Convenience constants for use in places NativeWind can't reach (e.g., StatusBar, navigation theme):

```ts
export const colors = {
  background: "#0a0a0a",
  foreground: "#fafafa",
  card: "#0a0a0a",
  border: "#262626",
  primary: "#fafafa",
  secondary: "#262626",
  muted: "#262626",
  mutedForeground: "#a3a3a3",
  destructive: "#7f1d1d",
  accent: "#262626",
} as const;
```

**Step 5: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): set up NativeWind with shared Tailwind theme"
```

---

### Task 3: Move API hooks to packages/core

This is the key shared-package refactoring. API hooks move from `apps/web/src/api/hooks/` to `packages/core/src/hooks/` so both web and mobile use them. The hooks need to accept an API client instance (since web and mobile configure auth differently).

**Files:**
- Create: `packages/core/src/hooks/use-goals.ts`
- Create: `packages/core/src/hooks/use-habits.ts`
- Create: `packages/core/src/hooks/use-journals.ts`
- Create: `packages/core/src/hooks/use-projects.ts`
- Create: `packages/core/src/hooks/use-activity.ts`
- Create: `packages/core/src/hooks/use-search.ts`
- Create: `packages/core/src/hooks/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json` (add TanStack Query + openapi-fetch deps)
- Modify: `apps/web/src/api/hooks/index.ts` (re-export from core)
- Modify: `apps/web/src/api/hooks/use-goals.ts` → delete, import from core
- (Same for all other hook files)

**Step 1: Update `packages/core/package.json`**

Add dependencies:

```json
{
  "name": "@mindtab/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./stores": "./src/stores/app-store.ts",
    "./hooks": "./src/hooks/index.ts"
  },
  "dependencies": {
    "@mindtab/api-spec": "workspace:*",
    "@tanstack/react-query": "^5.59.0",
    "openapi-fetch": "^0.13.5",
    "zustand": "^5.0.8"
  },
  "peerDependencies": {
    "react": "^18.3.1"
  }
}
```

**Step 2: Create shared API type**

Create `packages/core/src/hooks/types.ts`:

```ts
import type createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";

export type ApiClient = ReturnType<typeof createClient<paths>>;
```

**Step 3: Move hooks**

Copy each hook file from `apps/web/src/api/hooks/` to `packages/core/src/hooks/`, changing the import of `api` from a local import to a parameter. Example for goals:

Create `packages/core/src/hooks/use-goals.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function goalsQueryOptions(api: ApiClient, params?: { projectId?: string; includeArchived?: boolean }) {
  return queryOptions({
    queryKey: ["goals", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals", {
        params: { query: params },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function goalQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: ["goals", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function goalsCountQueryOptions(api: ApiClient, params?: { projectId?: string; includeArchived?: boolean }) {
  return queryOptions({
    queryKey: ["goals", "count", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals", {
        params: { query: params },
      });
      if (error) throw error;
      return (data as any[])?.length ?? 0;
    },
  });
}

export function useCreateGoal(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; description?: string; status?: string; priority?: string; impact?: string; projectId?: string }) => {
      const { data, error } = await api.POST("/goals", { body: body as any });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ... same pattern for useUpdateGoal, useDeleteGoal, useUpdateGoalPositions, useArchiveCompletedGoals
// Copy the exact mutation logic from apps/web/src/api/hooks/use-goals.ts, replacing `api` with the parameter
```

Apply the same pattern to `use-habits.ts`, `use-journals.ts`, `use-projects.ts`, `use-activity.ts`, `use-search.ts`. Each queryOptions and mutation hook takes `api: ApiClient` as the first parameter.

**Step 4: Create `packages/core/src/hooks/index.ts`**

```ts
export * from "./use-goals";
export * from "./use-habits";
export * from "./use-journals";
export * from "./use-projects";
export * from "./use-activity";
export * from "./use-search";
export type { ApiClient } from "./types";
```

**Step 5: Update `packages/core/src/index.ts`**

```ts
export { useAppStore, EActiveLayout } from "./stores/app-store";
export type { ActiveLayout } from "./stores/app-store";
export * from "./hooks";
```

**Step 6: Update web app to use shared hooks**

Replace `apps/web/src/api/hooks/index.ts` to re-export from core, passing the local `api` client:

```ts
// apps/web/src/api/hooks/index.ts
import { api } from "../client";
import {
  goalsQueryOptions as _goalsQueryOptions,
  goalQueryOptions as _goalQueryOptions,
  goalsCountQueryOptions as _goalsCountQueryOptions,
  useCreateGoal as _useCreateGoal,
  useUpdateGoal as _useUpdateGoal,
  useDeleteGoal as _useDeleteGoal,
  useUpdateGoalPositions as _useUpdateGoalPositions,
  useArchiveCompletedGoals as _useArchiveCompletedGoals,
  // ... all other hooks
} from "@mindtab/core";

// Bind the API client for web consumers
export const goalsQueryOptions = (params?: Parameters<typeof _goalsQueryOptions>[1]) => _goalsQueryOptions(api, params);
export const goalQueryOptions = (id: string) => _goalQueryOptions(api, id);
export const goalsCountQueryOptions = (params?: Parameters<typeof _goalsCountQueryOptions>[1]) => _goalsCountQueryOptions(api, params);
export const useCreateGoal = () => _useCreateGoal(api);
export const useUpdateGoal = () => _useUpdateGoal(api);
export const useDeleteGoal = () => _useDeleteGoal(api);
export const useUpdateGoalPositions = () => _useUpdateGoalPositions(api);
export const useArchiveCompletedGoals = () => _useArchiveCompletedGoals(api);

// ... same pattern for habits, journals, projects, activity, search
// This preserves the existing import paths so no web components need to change

// Auth stays web-specific
export { useAuth } from "./use-auth";
```

**Step 7: Delete old individual hook files from web**

Remove `apps/web/src/api/hooks/use-goals.ts`, `use-habits.ts`, `use-journals.ts`, `use-projects.ts`, `use-activity.ts`, `use-search.ts`. Keep `use-auth.ts` (web-specific).

**Step 8: Verify web app still works**

```bash
cd ~/Desktop/NovaProjecta/mindtab-v2
pnpm --filter @mindtab/web dev
```

Open in browser, verify goals, habits, journals, projects all load and mutations work.

**Step 9: Commit**

```bash
git add packages/core/ apps/web/src/api/hooks/
git commit -m "refactor: move API hooks to packages/core for web+mobile sharing"
```

---

### Task 4: Backend auth changes for mobile

The Go backend needs to support mobile clients that can't use httpOnly cookies. When `X-Platform: mobile` header is present, return the refresh token in the response body and accept it in the request body.

**Files:**
- Modify: `server/internal/handler/auth.go`

**Step 1: Update the `Google` handler**

In `server/internal/handler/auth.go`, after generating the refresh token, check for the mobile header:

```go
// After line 128 (storing refresh token in DB), replace the cookie + response section:

// Check if mobile client
isMobile := r.Header.Get("X-Platform") == "mobile"

if !isMobile {
    // Set refresh token as httpOnly cookie (web only).
    http.SetCookie(w, &http.Cookie{
        Name:     "mindtab_refresh",
        Value:    rawRefresh,
        Path:     "/",
        MaxAge:   30 * 24 * 60 * 60,
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
    })
}

resp := authResponse{
    AccessToken: accessToken,
    User:        toUserJSON(user),
}

if isMobile {
    // Mobile clients can't use httpOnly cookies, so include refresh token in body.
    WriteJSON(w, http.StatusOK, mobileAuthResponse{
        AccessToken:  accessToken,
        RefreshToken: rawRefresh,
        User:         toUserJSON(user),
    })
    return
}

WriteJSON(w, http.StatusOK, resp)
```

Add the new response type:

```go
type mobileAuthResponse struct {
    AccessToken  string   `json:"accessToken"`
    RefreshToken string   `json:"refreshToken"`
    User         userJSON `json:"user"`
}
```

**Step 2: Update the `Refresh` handler**

Accept refresh token from either cookie (web) or request body (mobile):

```go
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
    isMobile := r.Header.Get("X-Platform") == "mobile"

    var rawToken string
    if isMobile {
        // Mobile sends refresh token in request body.
        var req struct {
            RefreshToken string `json:"refreshToken"`
        }
        if err := ReadJSON(r, &req); err != nil || req.RefreshToken == "" {
            WriteError(w, http.StatusUnauthorized, "missing refresh token")
            return
        }
        rawToken = req.RefreshToken
    } else {
        // Web sends refresh token as cookie.
        cookie, err := r.Cookie("mindtab_refresh")
        if err != nil {
            WriteError(w, http.StatusUnauthorized, "missing refresh token")
            return
        }
        rawToken = cookie.Value
    }

    // Hash and look up the token.
    oldHash := auth.HashToken(rawToken)
    token, err := h.queries.GetRefreshToken(r.Context(), oldHash)
    if err != nil {
        WriteError(w, http.StatusUnauthorized, "invalid or expired refresh token")
        return
    }

    // Delete old refresh token (rotation).
    if err := h.queries.DeleteRefreshToken(r.Context(), oldHash); err != nil {
        slog.Error("failed to delete old refresh token", "error", err)
    }

    // Get user for the new access token.
    user, err := h.queries.GetUserByID(r.Context(), token.UserID)
    if err != nil {
        slog.Error("failed to get user", "error", err)
        WriteError(w, http.StatusInternalServerError, "failed to get user")
        return
    }

    // Generate new access token.
    accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
    if err != nil {
        slog.Error("failed to generate access token", "error", err)
        WriteError(w, http.StatusInternalServerError, "failed to generate token")
        return
    }

    // Generate new refresh token.
    rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
    if err != nil {
        slog.Error("failed to generate refresh token", "error", err)
        WriteError(w, http.StatusInternalServerError, "failed to generate token")
        return
    }

    // Store new refresh token.
    expiresAt := time.Now().Add(30 * 24 * time.Hour)
    err = h.queries.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
        UserID:    user.ID,
        TokenHash: hashRefresh,
        ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
    })
    if err != nil {
        slog.Error("failed to store refresh token", "error", err)
        WriteError(w, http.StatusInternalServerError, "failed to store token")
        return
    }

    if isMobile {
        WriteJSON(w, http.StatusOK, map[string]string{
            "accessToken":  accessToken,
            "refreshToken": rawRefresh,
        })
        return
    }

    // Set new cookie (web).
    http.SetCookie(w, &http.Cookie{
        Name:     "mindtab_refresh",
        Value:    rawRefresh,
        Path:     "/",
        MaxAge:   30 * 24 * 60 * 60,
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
    })

    WriteJSON(w, http.StatusOK, map[string]string{
        "accessToken": accessToken,
    })
}
```

**Step 3: Update CORS middleware**

In `server/internal/middleware/cors.go`, ensure `X-Platform` is in the allowed headers list:

```go
AllowedHeaders: []string{"Authorization", "Content-Type", "X-Platform"},
```

**Step 4: Verify web auth still works**

```bash
docker compose up api
# Test login in browser — should still work with cookies
```

**Step 5: Commit**

```bash
git add server/internal/handler/auth.go server/internal/middleware/cors.go
git commit -m "feat(api): support mobile auth with refresh token in response body"
```

---

## Phase 2: Auth & App Shell

### Task 5: Create mobile auth module

**Files:**
- Create: `apps/mobile/src/lib/auth.ts`
- Create: `apps/mobile/src/lib/api-client.ts`

**Step 1: Create `apps/mobile/src/lib/auth.ts`**

Token management using expo-secure-store:

```ts
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "mindtab_access_token";
const REFRESH_TOKEN_KEY = "mindtab_refresh_token";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
```

**Step 2: Create `apps/mobile/src/lib/api-client.ts`**

```ts
import createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export const api = createClient<paths>({ baseUrl: API_URL });

// Add auth interceptor
api.use({
  async onRequest({ request }) {
    const token = await getAccessToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    request.headers.set("X-Platform", "mobile");
    return request;
  },
  async onResponse({ response, request }) {
    if (response.status === 401 && !request.url.includes("/auth/")) {
      // Attempt refresh
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return response;

      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Platform": "mobile",
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        await setAccessToken(data.accessToken);
        await setRefreshToken(data.refreshToken);

        // Retry original request with new token
        const retryRequest = new Request(request, {
          headers: new Headers(request.headers),
        });
        retryRequest.headers.set("Authorization", `Bearer ${data.accessToken}`);
        return fetch(retryRequest);
      } else {
        // Refresh failed — clear tokens (will trigger login screen)
        await clearTokens();
      }
    }
    return response;
  },
});
```

**Step 3: Commit**

```bash
git add apps/mobile/src/lib/
git commit -m "feat(mobile): add auth token management and API client"
```

---

### Task 6: Create mobile auth hook and Google Sign-In

**Files:**
- Create: `apps/mobile/src/hooks/use-auth.ts`

**Step 1: Create `apps/mobile/src/hooks/use-auth.ts`**

```ts
import { create } from "zustand";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { api } from "~/lib/api-client";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
} from "~/lib/auth";

type User = {
  id: string;
  name: string;
  email: string;
  image: string;
  xp: number;
  onboardingCompleted: boolean;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _refreshSession: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
});

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  _hasChecked: false,

  _refreshSession: async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        set({ isLoading: false, _hasChecked: true });
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080"}/auth/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
          body: JSON.stringify({ refreshToken }),
        }
      );

      if (!res.ok) {
        await clearTokens();
        set({ user: null, isAuthenticated: false, isLoading: false, _hasChecked: true });
        return;
      }

      const data = await res.json();
      await setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);

      // Fetch user profile
      const { data: user, error } = await api.GET("/users/me");
      if (error) throw error;

      set({
        user: user as User,
        isAuthenticated: true,
        isLoading: false,
        _hasChecked: true,
      });
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false, _hasChecked: true });
    }
  },

  login: async () => {
    try {
      set({ isLoading: true });
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) throw new Error("No ID token");

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080"}/auth/google`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
          body: JSON.stringify({ idToken }),
        }
      );

      if (!res.ok) throw new Error("Login failed");

      const data = await res.json();
      await setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);

      set({
        user: data.user as User,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await clearTokens();
    try { await GoogleSignin.signOut(); } catch {}
    set({ user: null, isAuthenticated: false, _hasChecked: false });
  },
}));

export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    hasChecked: store._hasChecked,
    login: store.login,
    logout: store.logout,
    refreshSession: store._refreshSession,
  };
}
```

**Step 2: Commit**

```bash
git add apps/mobile/src/hooks/
git commit -m "feat(mobile): add auth hook with Google Sign-In"
```

---

### Task 7: Create root layout, providers, and auth guard

**Files:**
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/src/providers.tsx`

**Step 1: Create `apps/mobile/src/providers.tsx`**

```tsx
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner-native";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
```

**Step 2: Create `apps/mobile/app/_layout.tsx`**

```tsx
import "../src/styles/globals.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Providers } from "~/providers";
import { useAuth } from "~/hooks/use-auth";
import { useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { colors } from "~/styles/colors";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasChecked, user, refreshSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hasChecked) {
      refreshSession();
    }
  }, [hasChecked]);

  useEffect(() => {
    if (isLoading || !hasChecked) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "(onboarding)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && !user?.onboardingCompleted && !inOnboarding) {
      router.replace("/(onboarding)");
    } else if (isAuthenticated && user?.onboardingCompleted && (inAuthGroup || inOnboarding)) {
      router.replace("/(tabs)/goals");
    }
  }, [isAuthenticated, isLoading, hasChecked, user, segments]);

  if (isLoading || !hasChecked) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
        </Stack>
      </AuthGuard>
    </Providers>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/app/ apps/mobile/src/providers.tsx
git commit -m "feat(mobile): add root layout with auth guard and providers"
```

---

### Task 8: Create login screen

**Files:**
- Create: `apps/mobile/app/(auth)/_layout.tsx`
- Create: `apps/mobile/app/(auth)/login.tsx`

**Step 1: Create `apps/mobile/app/(auth)/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  );
}
```

**Step 2: Create `apps/mobile/app/(auth)/login.tsx`**

```tsx
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";

export default function LoginScreen() {
  const { login } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    try {
      setIsSigningIn(true);
      await login();
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-4xl font-bold text-foreground mb-2">MindTab</Text>
      <Text className="text-muted-foreground text-center mb-12">
        Track goals, build habits, capture thoughts.
      </Text>

      <Pressable
        onPress={handleLogin}
        disabled={isSigningIn}
        className="flex-row items-center justify-center bg-white rounded-lg px-6 py-3 w-full max-w-xs"
      >
        {isSigningIn ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text className="text-black font-semibold text-base">
            Sign in with Google
          </Text>
        )}
      </Pressable>
    </View>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/app/\(auth\)/
git commit -m "feat(mobile): add login screen with Google Sign-In"
```

---

### Task 9: Create bottom tab navigator

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/goals/index.tsx` (placeholder)
- Create: `apps/mobile/app/(tabs)/habits/index.tsx` (placeholder)
- Create: `apps/mobile/app/(tabs)/notes/index.tsx` (placeholder)
- Create: `apps/mobile/app/(tabs)/projects/index.tsx` (placeholder)

**Step 1: Create `apps/mobile/app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from "expo-router";
import { Target, CheckSquare, FileEdit, FolderOpen } from "lucide-react-native";
import { colors } from "~/styles/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color, size }) => <Target size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: "Habits",
          tabBarIcon: ({ color, size }) => <CheckSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Notes",
          tabBarIcon: ({ color, size }) => <FileEdit size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color, size }) => <FolderOpen size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

**Step 2: Create placeholder screens for each tab**

Create `apps/mobile/app/(tabs)/goals/index.tsx`:
```tsx
import { View, Text } from "react-native";

export default function GoalsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-foreground">Goals</Text>
    </View>
  );
}
```

Repeat for `habits/index.tsx`, `notes/index.tsx`, `projects/index.tsx` with appropriate text.

**Step 3: Create stack layouts for each tab**

Create `apps/mobile/app/(tabs)/goals/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function GoalsLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }} />
  );
}
```

Repeat for `habits/_layout.tsx`, `notes/_layout.tsx`, `projects/_layout.tsx`.

**Step 4: Verify the app loads**

```bash
cd apps/mobile
npx expo start --dev-client
```

Should see bottom tabs with 4 tabs, each showing placeholder text.

**Step 5: Commit**

```bash
git add apps/mobile/app/\(tabs\)/
git commit -m "feat(mobile): add bottom tab navigator with placeholder screens"
```

---

## Phase 3: Core Features

### Task 10: Create shared mobile UI components

**Files:**
- Create: `apps/mobile/src/components/ui/button.tsx`
- Create: `apps/mobile/src/components/ui/input.tsx`
- Create: `apps/mobile/src/components/ui/card.tsx`
- Create: `apps/mobile/src/components/ui/badge.tsx`
- Create: `apps/mobile/src/components/ui/empty-state.tsx`
- Create: `apps/mobile/src/components/ui/loading.tsx`

Build minimal UI primitives styled with NativeWind, matching the web's dark theme. These are simple wrappers — no Radix UI on mobile, just styled `<Pressable>`, `<TextInput>`, `<View>` components.

Example `button.tsx`:
```tsx
import { Pressable, Text, ActivityIndicator, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        ghost: "",
        outline: "border border-border",
      },
      size: {
        default: "px-4 py-2.5",
        sm: "px-3 py-1.5",
        lg: "px-6 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = PressableProps & VariantProps<typeof buttonVariants> & {
  loading?: boolean;
  children: React.ReactNode;
};

export function Button({ variant, size, loading, children, className, ...props }: ButtonProps) {
  return (
    <Pressable
      className={buttonVariants({ variant, size, className })}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "default" ? "#0a0a0a" : "#fafafa"} />
      ) : typeof children === "string" ? (
        <Text className={`font-medium ${variant === "default" ? "text-primary-foreground" : "text-foreground"}`}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
```

Apply same pattern for Input, Card, Badge, EmptyState, Loading components.

**Commit after each component or batch.**

---

### Task 11: Implement Goals tab

**Files:**
- Create: `apps/mobile/src/components/goals/goal-list.tsx`
- Create: `apps/mobile/src/components/goals/goal-item.tsx`
- Create: `apps/mobile/src/components/goals/goal-status-badge.tsx`
- Modify: `apps/mobile/app/(tabs)/goals/index.tsx`
- Create: `apps/mobile/app/(tabs)/goals/[id].tsx`
- Create: `apps/mobile/app/(modals)/create-goal.tsx`

**Goal list screen:**
- FlatList of goals, grouped by status (SectionList)
- Each item shows: title, priority flag, impact indicator, project badge
- Tap → navigate to goal detail
- Pull-to-refresh
- FAB or header button → create goal modal
- Filter by active project (from Zustand store)

**Goal detail/edit screen:**
- Title, description, status picker, priority picker, impact picker, project picker
- Save/delete buttons
- Status can be changed inline (picker or segmented control)

**Create goal modal:**
- Form with title, description, status, priority, impact, project
- Submit calls `useCreateGoal(api)`

Use the shared hooks from `@mindtab/core` with the mobile API client. The `api` instance is imported from `~/lib/api-client`.

---

### Task 12: Implement Habits tab

**Files:**
- Create: `apps/mobile/src/components/habits/habit-list.tsx`
- Create: `apps/mobile/src/components/habits/habit-card.tsx`
- Create: `apps/mobile/src/components/habits/week-grid.tsx`
- Modify: `apps/mobile/app/(tabs)/habits/index.tsx`
- Create: `apps/mobile/app/(tabs)/habits/[id].tsx`
- Create: `apps/mobile/app/(modals)/create-habit.tsx`

**Habits screen layout:**
- Top section: "Today" — list of habits with checkboxes for today
- Bottom section: Weekly grid (horizontal scroll, 5 weeks visible)
- Check/uncheck triggers: haptic feedback (`expo-haptics`), confetti animation, +10/-10 XP toast
- Pull-to-refresh

**Confetti animation:**
- Use `react-native-reanimated` for the "+10 XP" floating text
- Simple particle burst from the checkbox position
- Match web's amber/red colors

**Weekly grid:**
- Horizontal ScrollView, each column = 1 day
- Rows = habits
- Cells = colored circles (filled = completed, outline = missed, gray = future)
- Current day highlighted

---

### Task 13: Implement Notes tab

**Files:**
- Create: `apps/mobile/src/components/notes/note-list.tsx`
- Create: `apps/mobile/src/components/notes/note-card.tsx`
- Modify: `apps/mobile/app/(tabs)/notes/index.tsx`
- Create: `apps/mobile/app/(tabs)/notes/[id].tsx`
- Create: `apps/mobile/app/(tabs)/notes/edit/[id].tsx`
- Create: `apps/mobile/app/(modals)/create-note.tsx`

**Notes list:**
- FlatList of notes, most recent first
- Each card shows: title, truncated content preview (plain text from HTML), project badge, timestamp
- Tap → note detail (read mode)
- FAB → create note modal

**Note detail (read mode):**
- Full TipTap content rendered via `tentap-editor` in read-only mode
- Edit button in header → navigates to edit screen
- Delete button

**Note edit:**
- `@10play/tentap-editor` with toolbar (bold, italic, strike, lists, code, link)
- Title input at top
- Project picker
- Save button

**Create note modal:**
- Same editor setup as edit
- Title, content, project picker

---

### Task 14: Implement Projects tab

**Files:**
- Create: `apps/mobile/src/components/projects/project-list.tsx`
- Create: `apps/mobile/src/components/projects/project-card.tsx`
- Modify: `apps/mobile/app/(tabs)/projects/index.tsx`
- Create: `apps/mobile/app/(tabs)/projects/[id].tsx`
- Create: `apps/mobile/app/(modals)/create-project.tsx`

**Projects list:**
- FlatList of projects
- Each card shows: name, status badge, goal count, journal count
- Tap → project detail

**Project detail:**
- Project name, description, status, date range
- Two sections: "Goals" (filtered list) and "Notes" (filtered list)
- Edit button → edit modal
- Archive/delete actions

---

### Task 15: Implement Command Palette

**Files:**
- Create: `apps/mobile/app/(modals)/command-palette.tsx`
- Create: `apps/mobile/src/components/command-palette/search-results.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (add search icon to header)

**Command palette:**
- Full-screen modal with search input at top (auto-focused)
- Debounced search (300ms)
- Results grouped: Goals, Habits, Notes
- Uses `searchGoalsQueryOptions`, `searchHabitsQueryOptions`, `searchJournalsQueryOptions` from `@mindtab/core`
- Tap result → navigate to detail screen
- Quick actions: "Create Goal", "Create Habit", "Create Note"

**Trigger:**
- Search icon (magnifying glass) in the tab bar header, shown on all tabs

---

## Phase 4: Onboarding, Offline & Polish

### Task 16: Implement Onboarding flow

**Files:**
- Create: `apps/mobile/app/(onboarding)/_layout.tsx`
- Create: `apps/mobile/app/(onboarding)/index.tsx`
- Create: `apps/mobile/src/components/onboarding/welcome-step.tsx`
- Create: `apps/mobile/src/components/onboarding/create-project-step.tsx`
- Create: `apps/mobile/src/components/onboarding/create-goal-step.tsx`
- Create: `apps/mobile/src/components/onboarding/create-habit-step.tsx`
- Create: `apps/mobile/src/components/onboarding/notes-intro-step.tsx`
- Create: `apps/mobile/src/components/onboarding/extension-step.tsx`
- Create: `apps/mobile/src/components/onboarding/complete-step.tsx`

**Same 7-step flow as web, adapted to mobile:**
1. Welcome — greeting with user name
2. Create Project — name + description form
3. Create Goal — linked to project
4. Create Habit — title + frequency
5. Notes intro — explanation screen
6. Chrome Extension — skip or link to web (less relevant on mobile, could simplify to "Download on desktop")
7. Complete — celebration animation, calls `PATCH /users/me { onboardingCompleted: true }`

**Navigation:** Horizontal pagination with animated transitions (Reanimated). Progress bar at top. Back/Next buttons.

---

### Task 17: Set up offline cache with MMKV

**Files:**
- Create: `apps/mobile/src/lib/storage.ts`
- Modify: `apps/mobile/src/providers.tsx`

**Step 1: Create `apps/mobile/src/lib/storage.ts`**

```ts
import { MMKV } from "react-native-mmkv";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const mmkv = new MMKV({ id: "mindtab-query-cache" });

// Adapter for TanStack Query persister
const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.delete(key),
};

export const queryPersister = createSyncStoragePersister({
  storage: mmkvStorage,
});
```

**Step 2: Update providers.tsx**

```tsx
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister } from "~/lib/storage";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      {children}
      <Toaster position="top-center" />
    </PersistQueryClientProvider>
  );
}
```

**Step 3: Add offline detection**

Use React Native's `NetInfo` to show a banner when offline and prevent mutations:

```ts
import NetInfo from "@react-native-community/netinfo";
// Show "You're offline" banner at top of app
// Disable mutation buttons when offline
```

**Step 4: Commit**

```bash
git add apps/mobile/src/lib/storage.ts apps/mobile/src/providers.tsx
git commit -m "feat(mobile): add MMKV-backed offline query cache"
```

---

### Task 18: Add XP & streak display to header

**Files:**
- Create: `apps/mobile/src/components/header-right.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

**Header right component:**
- Shows: search icon (→ command palette), XP count, streak count, avatar
- XP: yellow dot + number
- Streak: green/red dot + number
- Avatar: small circular image (from user profile)
- Tap avatar → profile/settings screen

Wire into tab layout's `headerRight` option.

---

### Task 19: Profile/Settings screen

**Files:**
- Create: `apps/mobile/app/(tabs)/profile.tsx` (or as a modal)

**Simple screen:**
- User avatar, name, email
- XP display
- Streak display
- Logout button
- App version

Not a full tab — accessible from avatar tap in header. Could be a modal or a stack screen.

---

### Task 20: Add pull-to-refresh to all list screens

**Files:**
- Modify: `apps/mobile/app/(tabs)/goals/index.tsx`
- Modify: `apps/mobile/app/(tabs)/habits/index.tsx`
- Modify: `apps/mobile/app/(tabs)/notes/index.tsx`
- Modify: `apps/mobile/app/(tabs)/projects/index.tsx`

Add `RefreshControl` to all FlatList/ScrollView components:

```tsx
import { RefreshControl } from "react-native";
const { refetch, isFetching } = useQuery(goalsQueryOptions(api));

<FlatList
  refreshControl={
    <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fafafa" />
  }
/>
```

---

### Task 21: Final integration testing and polish

**Steps:**
1. Run full app on iOS simulator and Android emulator
2. Test auth flow: login → onboarding → main app → logout → login again
3. Test all CRUD operations: goals, habits, journals, projects
4. Test habit check/uncheck with haptics and XP animation
5. Test command palette search
6. Test offline: enable airplane mode, verify cached data still shows
7. Test pull-to-refresh on all screens
8. Fix any visual inconsistencies with the web app
9. Add loading skeletons where needed

**Commit after each fix.**

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1: Scaffold | 1-4 | Expo setup, NativeWind, shared hooks refactor, backend auth |
| 2: Auth & Shell | 5-9 | Auth module, Google Sign-In, root layout, login, tab navigator |
| 3: Core Features | 10-15 | UI components, goals, habits, notes, projects, command palette |
| 4: Polish | 16-21 | Onboarding, offline cache, XP/streak, profile, pull-to-refresh, testing |
