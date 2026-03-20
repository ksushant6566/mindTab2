# Chat, Vault & Tab Navigation — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Split the mobile app into three tabs (Chat / Home / Vault) switched via header chips. Chat is a personal assistant with streaming responses, persistent conversations, RAG over saved vault content, and CRUD on goals/habits/journals/projects. Vault displays saved articles and images in a Pinterest-style card grid. Home remains the existing dashboard unchanged.

## Navigation

### Header Redesign

**Before:** `[Avatar] [Lv.X — XP bar — XP count] [Streak] [Search]`
**After:** `[Avatar] [Chat] [Home] [Vault] [Search]`

- XP bar, level badge, XP count, streak flame — all removed from header
- XP display moves into the profile modal (accessible via avatar tap)
- Three pill chips centered horizontally:
  - Active chip: white fill, black text, `font-weight: 600`
  - Inactive chips: transparent, `1px solid #2a2a2a` border, `#666` text
- Avatar (left) and search icon (right) remain unchanged

### Route Structure

```
app/(main)/
├── _layout.tsx              # Stack wrapping the tab group
├── (tabs)/
│   ├── _layout.tsx          # Tab navigator with custom tabBar in header
│   ├── chat.tsx             # Chat tab (conversation list / active chat)
│   ├── index.tsx            # Home tab (current dashboard)
│   └── vault.tsx            # Vault tab (saves grid)
├── chat/
│   └── [id].tsx             # Individual conversation (pushed from chat tab)
├── vault/
│   └── [id].tsx             # Individual save detail (pushed from vault tab)
├── goals/...                # Existing routes unchanged
├── habits/...
├── notes/...
└── projects/...
```

- Uses Expo Router tab group inside `(main)` with a custom `tabBar` component rendering the header chips
- Each tab has its own navigation stack (chat pushes to conversation detail, vault pushes to save detail)
- Existing goal/habit/note/project routes remain unchanged

## Design Language

Monochromatic only — black, white, and grays. No color accents.

| Token | Value | Usage |
|-------|-------|-------|
| Primary text | `#fafafa` | Titles, headings |
| Secondary text | `#e0e0e0` | Body text, message content |
| Tertiary text | `#888` | Labels, secondary info |
| Muted text | `#666` | Timestamps, placeholders, inactive |
| Dim text | `#555` | Hints, metadata |
| Subtle text | `#444` | Placeholders, disabled |
| Background | `#0a0a0a` | Screen background |
| Elevated | `#111` | Recent conversation rows |
| Surface | `#141414` | Cards, assistant bubbles, input box |
| Border | `#1a1a1a` | Dividers, card borders |
| Subtle border | `#222` | Input borders, inactive chips |
| Interactive | `#ffffff` | Active chips, send button, user bubbles, avatar, FAB |

## Chat Tab

### Empty State (New Chat)

- Centered greeting: "MindTab" title + "Your personal assistant" subtitle
- 4 suggestion chips below (tappable, bordered):
  - "What are my active goals?"
  - "Summarize my saved articles"
  - "Create a new habit"
  - "How was my week?"
- Recent conversations list at bottom:
  - Section label: "RECENT" (uppercase, `#555`)
  - Each row: title + relative timestamp, `#111` background, rounded, tappable → navigates to `chat/[id]`
- Grok-style input box pinned to bottom (see Input Box section)

### Active Conversation

- Header changes to: `[‹ back] [conversation title] [...menu]`
  - Back arrow returns to chat tab empty state / conversation list
  - Three-dot menu: options for delete conversation
- Scrollable message list
- Input box pinned to bottom

### Message Bubbles

**User messages:**
- Background: `#ffffff`, text: `#0a0a0a`
- Right-aligned
- Border radius: `18px 18px 4px 18px` (flat bottom-right)
- Max width: 80%
- Font weight: 450

**Assistant messages:**
- Background: `#141414`, text: `#e0e0e0`
- Left-aligned
- Border radius: `4px 18px 18px 18px` (flat top-left)
- Max width: 85%
- Supports markdown rendering (bold, lists, code)

**Tool call indicators:**
- Displayed as a small pill above the assistant message
- Background: `#111`, border: `1px solid #1a1a1a`
- Icon: `⚡` (in-progress) or `✓` (completed) + short description (e.g., "Checked your goals")
- Tappable to expand and show tool details

**Streaming state:**
- Three pulsing dots (`#555`, `#888`, `#bbb`) in an assistant bubble while waiting
- Text appears token-by-token with smooth scroll-to-bottom
- Blinking cursor at end of streaming text

### Input Box (Grok-style)

- Container: `#141414` background, `border-radius: 20px`, `1px solid #222` border
- Text area on top: placeholder "Ask anything..." in `#444`, expands vertically with content
- Action row below:
  - Left: Paperclip button (attachment, functional) — `36x36`, `#1c1c1c` circle, `#777` icon
  - Right: Mic button (placeholder, non-functional) — `36x36`, `#1c1c1c` circle, `#777` icon
  - Right: Send button — `36x36`, `#ffffff` circle, `#0a0a0a` arrow icon
- Send button disabled (dimmed) when input is empty

### Attachments

- Paperclip tap opens system file/image picker
- Selected attachments show as thumbnail chips above the text input (inside the input container)
- Each chip has an `×` to remove
- Files are uploaded via `POST /chat/attachments` before sending the message
- `media_key` references are sent in the WebSocket `message.send` payload

### Conversation Persistence

- Conversations auto-create on first message (no explicit "new chat" button — just type and send)
- Title auto-generated by LLM after first exchange, delivered via `conversation.title` WebSocket event
- Conversation list sorted by `updated_at` descending

## Vault Tab

### Grid View

- Filter chips at top: `[All] [Articles] [Images]` — same chip styling as tab chips
- Masonry two-column layout with `10px` gap
- Pull-to-refresh to reload saves

**Article cards:**
- `#141414` background, `border-radius: 14px`, `1px solid #1a1a1a` border
- Optional thumbnail area at top (if `source_thumbnail_url` exists)
- Title: `#e0e0e0`, 13px, weight 500
- Snippet: `#555`, 11px, 2 lines max
- Tags: small pills with `#1a1a1a` background, `#666` text, 10px
- Articles without thumbnails show title + snippet directly (no placeholder image)
- Source domain shown with link icon when available

**Image cards:**
- Same card styling as articles
- Image thumbnail fills the top area (aspect ratio preserved)
- Title below: `#e0e0e0`, 13px
- OCR excerpt shown if available: `#555`, 11px

**Processing state:**
- Card at 60% opacity
- Spinner icon + "Processing..." text
- URL shown as title

**FAB:**
- White circle (`52x52`), `+` icon in black
- Bottom-right positioned
- Tap opens bottom sheet with two options:
  - "Save URL" — text input for article URL
  - "Save Image" — opens camera/gallery picker
- Calls existing `POST /saves` endpoint

### Detail View

- Pushed as a new screen from vault grid
- Header: `[‹ Vault] [share icon] [delete icon]`
- Content sections:
  - Source domain + read time
  - Title (22px, weight 600)
  - Tags as bordered pills
  - Summary in a `#111` card with `12px` border radius
  - Key topics as a bulleted list
  - Extracted content (scrollable)
- Bottom: "Open Original Article ↗" button (white, full-width) — opens source URL in browser
- For images: shows the full image at top instead of source domain

## Home Tab

Current dashboard exactly as-is, with these changes only:
- XP bar, level badge, and streak flame removed from header (now handled by tab chips)
- FAB and Habits Bubble remain on Home tab only — not visible on Chat or Vault tabs
- No other changes to dashboard content or behavior

## Backend: Database Schema

### mindmap_conversations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, default gen_random_uuid() |
| user_id | VARCHAR(255) | FK to mindmap_user, NOT NULL |
| title | TEXT | Auto-generated, nullable initially |
| created_at | TIMESTAMPTZ | default now() |
| updated_at | TIMESTAMPTZ | default now() |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Indexes:**
- `idx_conversations_user_id` on (user_id)
- `idx_conversations_updated_at` on (updated_at DESC)

### mindmap_messages

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, default gen_random_uuid() |
| conversation_id | UUID | FK to mindmap_conversations, NOT NULL |
| role | TEXT | 'user', 'assistant', 'tool' |
| content | TEXT | Message text (markdown for assistant) |
| attachments | JSONB | `[{filename, media_key, mime_type, size}]` or null |
| tool_calls | JSONB | For assistant messages invoking tools |
| tool_call_id | TEXT | For tool-result messages, links to tool_call |
| created_at | TIMESTAMPTZ | default now() |

**Indexes:**
- `idx_messages_conversation_id` on (conversation_id)
- `idx_messages_created_at` on (created_at)

## Backend: REST API

### GET /conversations

List user's conversations.

**Query params:** `limit` (default 20, max 100), `offset` (default 0)

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Weekly goals review",
      "created_at": "2026-03-20T10:00:00Z",
      "updated_at": "2026-03-20T10:05:00Z"
    }
  ],
  "total": 42
}
```

### GET /conversations/{id}/messages

Load message history for a conversation.

**Query params:** `limit` (default 50, max 100), `offset` (default 0)

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What are my active goals?",
      "attachments": null,
      "tool_calls": null,
      "tool_call_id": null,
      "created_at": "2026-03-20T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "You have 3 active goals...",
      "attachments": null,
      "tool_calls": [{"id": "tc_1", "tool": "list_goals", "args": {"status": "active"}}],
      "tool_call_id": null,
      "created_at": "2026-03-20T10:00:01Z"
    }
  ],
  "total": 12
}
```

### DELETE /conversations/{id}

Soft-delete a conversation.

**Response:** `204 No Content`

### POST /chat/attachments

Upload a file for use in chat messages.

**Request:** `multipart/form-data` with `file` field

**Response 201:**
```json
{
  "media_key": "chat/uuid/filename.jpg",
  "filename": "filename.jpg",
  "mime_type": "image/jpeg",
  "size": 245000
}
```

## Backend: WebSocket Protocol

### Connection

`wss://api.mindtab.in/ws/chat?token={access_token}`

Server validates token on upgrade. Returns 401 if invalid. Connection stays open for the session. Server sends `ping` frames every 30s; client must respond with `pong`. Connection closes after 5 minutes of inactivity (no messages sent).

### Client → Server

**message.send** — Send a message and start streaming a response:
```json
{
  "type": "message.send",
  "conversation_id": "uuid-or-null",
  "content": "What are my active goals this week?",
  "attachments": ["media-key-1"]
}
```
- `conversation_id: null` creates a new conversation
- `attachments` is optional, contains media_keys from prior `POST /chat/attachments` uploads

**message.cancel** — Cancel the active stream:
```json
{
  "type": "message.cancel"
}
```

### Server → Client

**stream.start** — Response stream beginning:
```json
{
  "type": "stream.start",
  "conversation_id": "uuid",
  "message_id": "uuid"
}
```

**stream.delta** — Token chunk:
```json
{
  "type": "stream.delta",
  "content": "Here are"
}
```

**stream.tool_call** — LLM invoked a tool:
```json
{
  "type": "stream.tool_call",
  "tool": "list_goals",
  "args": {"status": "active"}
}
```

**stream.tool_result** — Server executed the tool:
```json
{
  "type": "stream.tool_result",
  "tool": "list_goals",
  "result": {"goals": [{"id": "...", "title": "...", "status": "active"}]}
}
```

**stream.end** — Stream complete:
```json
{
  "type": "stream.end",
  "message_id": "uuid"
}
```

**conversation.title** — Auto-generated title:
```json
{
  "type": "conversation.title",
  "conversation_id": "uuid",
  "title": "Weekly goals review"
}
```

**error** — Error occurred:
```json
{
  "type": "error",
  "code": "rate_limited",
  "message": "Too many requests, try again in 30s"
}
```

## Backend: LLM Tools

The Go server registers these as function-calling tools available to the LLM during chat:

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `list_goals` | `{status?, project_id?}` | `{goals: [{id, title, status, priority, project}]}` | List user's goals |
| `create_goal` | `{title, priority?, project_id?}` | `{id, title}` | Create a new goal |
| `update_goal` | `{id, title?, status?, priority?}` | `{id, title, status}` | Update a goal |
| `delete_goal` | `{id}` | `{success: true}` | Soft-delete a goal |
| `list_habits` | `{}` | `{habits: [{id, title, completed_today}]}` | List habits + today's status |
| `create_habit` | `{title, frequency?}` | `{id, title}` | Create a new habit |
| `toggle_habit` | `{id}` | `{id, completed: bool}` | Toggle today's completion |
| `list_journals` | `{project_id?}` | `{journals: [{id, title, snippet, updated_at}]}` | List journal entries |
| `create_journal` | `{title, content}` | `{id, title}` | Create a journal entry |
| `update_journal` | `{id, title?, content?}` | `{id, title}` | Update a journal |
| `delete_journal` | `{id}` | `{success: true}` | Soft-delete a journal |
| `list_projects` | `{}` | `{projects: [{id, name, color}]}` | List projects |
| `create_project` | `{name, color?}` | `{id, name}` | Create a project |
| `search_vault` | `{query, limit?}` | `{results: [{id, title, summary, similarity}]}` | Semantic search over saves |
| `get_vault_item` | `{id}` | `{id, title, summary, tags, content}` | Get full save details |

All tools execute server-side using the authenticated user's ID. The LLM receives the tool result and continues generating its response.

## Mobile State Management

### Chat State

- **React Query:** conversation list (`GET /conversations`), message history (`GET /conversations/{id}/messages`)
- **Zustand chat store:**
  - `activeConversationId: string | null`
  - `streamingMessageId: string | null`
  - `streamBuffer: string` (partial message being streamed)
  - `isStreaming: boolean`
  - `pendingToolCalls: {tool, args, result?}[]`
- WebSocket connection managed via a custom hook (`useWebSocket`) — connects on chat tab mount, disconnects on unmount
- On `stream.end`, flush `streamBuffer` into React Query cache for the conversation's messages

### Vault State

- **React Query:** saves list (`GET /saves`), individual save (`GET /saves/{id}`)
- Filter state (all/articles/images) as local `useState`

## Out of Scope

- Voice input (mic icon is a non-functional placeholder)
- Model selector
- Speak mode
- Chat message editing/regeneration
- Vault search within the vault tab (uses header search icon which opens existing command palette)
- Rich text formatting in chat input
- Typing indicators
- Read receipts
