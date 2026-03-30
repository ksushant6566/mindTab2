# Signed Media URLs

Replace token-based image auth with HMAC-signed URLs so mobile `<Image>` components can load authenticated media without managing Bearer tokens.

## Problem

React Native's `<Image>` component requires auth headers as a prop, but:
- Tokens cached in component state go stale
- No 401 retry or expiry check on image loads
- `accessToken` prop drills through 3 components (vault.tsx → SaveGrid → SaveCard)
- The pattern couples auth concerns to UI components

YouTube thumbnails (public CDN URLs) load fine. Only images served from our `/media/{key}` endpoint fail because they require authentication.

## Solution

The server signs media URLs with HMAC-SHA256 when building API responses. The mobile app uses the signed URL directly — no auth headers, no token props.

### URL Format

```
/media/{key}?sig={base64url_hmac}&exp={unix_timestamp}
```

- **Signing key**: `JWT_SECRET` from config (already secret, already available)
- **HMAC input**: `{key}:{exp}` — binds the signature to both the resource and the expiry
- **TTL**: 1 hour (3600 seconds)
- **Encoding**: base64url (URL-safe, no padding)

### Server Changes

#### 1. Sign helper

New function in `handler/saves.go` (or a small `handler/media.go` if preferred):

```go
func signMediaURL(key string, secret string, ttl time.Duration) string {
    exp := time.Now().Add(ttl).Unix()
    mac := hmac.New(sha256.New, []byte(secret))
    fmt.Fprintf(mac, "%s:%d", key, exp)
    sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
    return fmt.Sprintf("/media/%s?sig=%s&exp=%d", key, sig, exp)
}
```

#### 2. ServeMedia verification

The existing `ServeMedia` handler currently requires a Bearer token. Add a second code path:

1. If `sig` and `exp` query params are present → verify HMAC signature and check `exp > now`. If valid, serve the file. If invalid/expired, 403.
2. Else if `Authorization: Bearer` header is present → existing auth check (kept for web app and share extension).
3. Else → 401.

This is backward-compatible — existing Bearer-authenticated clients continue to work.

#### 3. API response fields

Add `source_media_url` to both `contentListJSON` and `contentJSON` response structs:

```go
SourceMediaURL *string `json:"source_media_url,omitempty"`
```

Populated in `List()` and `Get()` handlers when `media_key` is non-empty:

```go
if row.MediaKey.Valid {
    signed := signMediaURL(row.MediaKey.String, h.jwtSecret, 1*time.Hour)
    item.SourceMediaURL = &signed
}
```

The `SavesHandler` struct needs access to the JWT secret. It's already available in the config — pass it at construction time.

### Mobile Changes

#### 1. Types

Add to `RawSave` in `save-grid.tsx`:
```typescript
source_media_url?: string | null;
```

Add to `SaveDetail` in `vault/[id].tsx`:
```typescript
source_media_url?: string | null;
```

#### 2. SaveCard — use signed URL

Replace the current image rendering:
```typescript
// BEFORE: construct URL + auth headers
const imageUri = mediaKey ? `${API_URL}/media/${mediaKey}` : null;
const imageSource = imageUri
  ? { uri: imageUri, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined }
  : null;
```

With:
```typescript
// AFTER: use pre-signed URL from API
const imageUri = sourceMediaUrl ? `${API_URL}${sourceMediaUrl}` : null;
```

No headers needed. Remove `accessToken` from `SaveCardProps`.

#### 3. SaveGrid — remove accessToken prop

Remove `accessToken` from `SaveGridProps` and from the `SaveCard` render call. Pass `sourceMediaUrl` instead:
```typescript
sourceMediaUrl={item.source_media_url ?? undefined}
```

#### 4. vault.tsx — remove token management

Remove:
- `accessToken` state and `useEffect`
- `getAccessToken()` call from `queryFn`
- `latestToken` derivation and sync `useEffect`
- `accessToken` prop on `<SaveGrid>`

The `queryFn` simplifies to just fetching saves — no token juggling.

#### 5. vault/[id].tsx — same cleanup

Remove `accessToken` state and `useEffect`. Use `save.source_media_url` for the image source directly.

### What doesn't change

- **YouTube thumbnails**: already public CDN URLs, unaffected
- **POST /saves uploads**: use `authedFetch`, unaffected
- **Web app**: if it uses Bearer tokens for media, still works (backward-compatible)
- **iOS share extension**: uses Bearer tokens for API calls, still works
- **Habits screen**: uses `authedFetch` for connected notes, unaffected (but should migrate to `authedFetch` pattern — separate concern)

### Security

- Signed URLs are scoped to a single media key — no escalation possible
- 1-hour expiry limits exposure of leaked URLs
- HMAC-SHA256 with the JWT secret is computationally infeasible to forge
- The `exp` timestamp is part of the signed payload — cannot be tampered with
- Existing Bearer auth path is preserved, not weakened
