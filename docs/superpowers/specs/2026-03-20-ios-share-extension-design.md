# iOS Share Extension Design

**Date:** 2026-03-20
**Status:** Approved
**Branch:** feature/chat-vault-tabs

## Overview

MindTab becomes an iOS share target, allowing users to share content from any app (Twitter, Safari, Reddit, Camera Roll, etc.) directly to their vault. The share extension captures URLs, text, and images, shows a preview card for confirmation, and calls the saves API.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extension approach | Native Swift | Fast launch, no JS runtime overhead, small surface (~3 files) |
| Content types | URLs + text + images | Covers all major sharing scenarios; API already supports articles and images |
| Pre-extracted content | Yes, sent with URL | Avoids redundant server-side extraction (e.g., tweet text shared alongside tweet URL) |
| Auth strategy | App Groups + shared keychain with login prompt fallback | Standard iOS pattern; graceful error when not logged in |
| Share extension UI | SwiftUI preview card with Save button | Gives users confidence about what they're saving without friction |
| Offline handling | Require connectivity, show error | Keeps v1 simple; no local queue or background sync |

## 1. API Changes

### Extended `POST /saves` Request Body (Articles)

```json
{
  "url": "https://x.com/user/status/123",
  "content": "The actual tweet text or article excerpt...",
  "title": "Author Name or page title"
}
```

- `url` — required (unchanged)
- `content` — optional string, pre-extracted text content
- `title` — optional string, source title

Image uploads remain multipart form data, unchanged.

### Server-Side Behavior

When `content` (and optionally `title`) is provided:
- `extracted_text` is populated from `content`
- `source_title` is populated from `title`
- Processing pipeline skips extraction, proceeds directly to summarization/embedding
- All other processing (summary, tags, key_topics, embedding) runs normally

No database schema changes required — `extracted_text` and `source_title` columns already exist in `mindmap_content`.

## 2. App Groups & Shared Keychain

### App Group Identifier

`group.in.mindtab.app`

### Token Sharing

The main app writes auth tokens to the shared keychain (App Group-scoped), and the share extension reads them.

**Main app changes:**
- A small native Swift module exposes `setSharedToken(key, value)` and `getSharedToken(key)` for App Group keychain access
- Called from `use-auth.ts` on login, token refresh, and logout
- `expo-secure-store` doesn't support App Group keychain, so a custom native module is required

**Share extension reads:**
- On launch, reads access token from shared keychain
- If expired, calls `POST /auth/refresh` with the refresh token
- If no tokens found, shows "Please open MindTab and log in" message

**On logout:**
- Main app clears shared keychain tokens alongside its own secure store cleanup

### Xcode Configuration

- Enable "App Groups" capability on both the main app target (`MindTab`) and the share extension target (`MindTabShare`)
- Both reference `group.in.mindtab.app`
- Update `MindTab.entitlements` with the App Group entitlement

## 3. Share Extension Architecture

### Xcode Target

`MindTabShare` — a new iOS Share Extension target.

### File Structure

```
ios/
├── MindTab/                         # Existing main app
│   └── SharedKeychain/
│       └── SharedKeychainModule.swift   # Native module for shared keychain writes
├── MindTabShare/                    # New share extension
│   ├── ShareViewController.swift    # Entry point, content extraction
│   ├── ShareView.swift              # SwiftUI preview card UI
│   ├── APIClient.swift              # Lightweight HTTP client for saves API
│   ├── KeychainHelper.swift         # Shared keychain read + token refresh
│   ├── Info.plist                   # Extension config + activation rules
│   └── MindTabShare.entitlements    # App Group entitlement
```

### Content Extraction Flow

1. iOS invokes `ShareViewController` with `NSExtensionContext`
2. Controller iterates `extensionContext.inputItems` → `NSItemProvider` attachments
3. Detects content type by checking providers in order:
   - `kUTTypeImage` → load image data, prepare multipart upload
   - `kUTTypeURL` → load URL
   - `kUTTypeText` → load text string
4. Many apps (Twitter, Reddit) share both a URL and text — both are captured
5. Passes extracted content to `ShareView` for preview

### Activation Rules (Info.plist)

```xml
NSExtensionActivationRule = SUBQUERY(
  extensionItems, $item,
  SUBQUERY($item.attachments, $att,
    ANY $att.registeredTypeIdentifiers UTI-CONFORMS-TO "public.url"
    OR ANY $att.registeredTypeIdentifiers UTI-CONFORMS-TO "public.image"
    OR ANY $att.registeredTypeIdentifiers UTI-CONFORMS-TO "public.text"
  ).@count > 0
).@count > 0
```

MindTab appears in the share sheet only when the source app shares URLs, images, or text.

### API Calls from Extension

- URLs (with optional text): `POST /saves` with JSON body `{url, content?, title?}`
- Images: `POST /saves` with multipart form data
- Auth header: `Bearer <access_token>` from shared keychain

## 4. Share Extension UI

### Layout

```
┌─────────────────────────────────┐
│  ╳                   Save  [btn]│  Nav bar: cancel (X) + Save button
│─────────────────────────────────│
│                                 │
│  ┌───────┐  Article Title or   │  Preview card
│  │ thumb │  domain.com         │  - Articles: favicon/thumbnail + title + domain
│  └───────┘  "Tweet text or     │  - Images: image thumbnail
│              page excerpt..."   │  - Text-only: text snippet
│                                 │
│─────────────────────────────────│
│  Saving to Vault                │  Subtle footer label
└─────────────────────────────────┘
```

### States

1. **Loading** — spinner while extracting content from `NSItemProvider`
2. **Preview** — preview card with Save button enabled
3. **Saving** — Save button shows spinner, disabled to prevent double-tap
4. **Success** — checkmark animation, auto-dismisses after ~0.8s
5. **Error (network)** — "No internet connection. Please try again."
6. **Error (auth)** — "Please open MindTab and log in first."

### Styling

- Dark background (`#0a0a0a`), matching forced dark mode
- White text (`#fafafa`), secondary text (`#e0e0e0`)
- Monochromatic, consistent with the main app's design language
- Save button: white text on dark surface, rounded

## 5. Data Flow Summary

```
User taps Share → iOS Share Sheet → MindTabShare extension launches
  → ShareViewController extracts NSItemProvider attachments
  → Detects: URL? Text? Image? (captures all available)
  → ShareView shows preview card
  → User taps Save
  → KeychainHelper reads token from shared keychain
    → If expired: refresh via POST /auth/refresh
    → If missing: show "Please log in" error
  → APIClient calls POST /saves with content
    → URLs: JSON {url, content?, title?}
    → Images: multipart form data
  → On success: checkmark animation → auto-dismiss
  → On failure: show error message
```

## 6. Scope Boundaries

### In Scope (v1)
- Native Swift share extension with SwiftUI UI
- URL, text, and image content types
- Pre-extracted content passthrough (skip server extraction)
- Shared keychain auth via App Groups
- Preview card with Save confirmation
- Network connectivity requirement
- Dark mode styling matching main app

### Out of Scope (v1)
- Offline queueing / background sync
- Tags or folder selection in share UI
- Android share target (separate effort)
- Custom share extension icon (uses main app icon)
