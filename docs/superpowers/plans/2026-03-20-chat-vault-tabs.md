# Chat, Vault & Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the mobile app into three tabs (Chat / Home / Vault) with a personal assistant chat backed by WebSocket streaming, and a Pinterest-style vault grid for saved content.

**Architecture:** Go server gets new chat REST endpoints + WebSocket handler that proxies streaming LLM calls with tool-calling (CRUD on goals/habits/journals/projects + vault search). Mobile app restructures routing into an Expo Router tab group with a custom header-based tab bar. Vault tab consumes existing Saves API.

**Tech Stack:** Go + Chi + gorilla/websocket + Gemini streaming SDK, React Native + Expo Router tabs + Zustand + React Query + native WebSocket

**Spec:** `docs/superpowers/specs/2026-03-20-chat-vault-tabs-design.md`

---

## File Structure

### Server — New Files

| File | Responsibility |
|------|---------------|
| `server/migrations/000004_chat.up.sql` | Conversations + messages tables |
| `server/migrations/000004_chat.down.sql` | Drop chat tables |
| `server/internal/store/queries/conversations.sql` | sqlc queries for conversations |
| `server/internal/store/queries/messages.sql` | sqlc queries for messages |
| `server/internal/handler/chat.go` | REST: list conversations, get messages, delete, upload attachment |
| `server/internal/handler/ws.go` | WebSocket upgrade, connection lifecycle, message routing |
| `server/internal/chat/orchestrator.go` | Coordinates LLM streaming + tool execution + message persistence |
| `server/internal/chat/tools.go` | Tool definitions, argument parsing, execution against DB |
| `server/internal/chat/tools_test.go` | Tool execution tests |
| `server/internal/handler/chat_test.go` | REST handler tests |
| `server/internal/handler/ws_test.go` | WebSocket handler tests |

### Server — Modified Files

| File | Change |
|------|--------|
| `server/internal/providers/llm/interface.go` | Add `StreamComplete` method to interface |
| `server/internal/providers/llm/gemini.go` | Implement Gemini streaming |
| `server/internal/config/config.go` | Add chat-related config (system prompt path, etc.) |
| `server/cmd/api/main.go` | Register chat routes + WebSocket endpoint |
| `server/sqlc.yaml` | Ensure new query files are picked up (already uses glob) |
| `packages/api-spec/openapi.yaml` | Add conversation/message/attachment schemas and endpoints |

### Mobile — New Files

| File | Responsibility |
|------|---------------|
| `apps/mobile/app/(main)/(tabs)/_layout.tsx` | Tab navigator with custom header-based tabBar |
| `apps/mobile/app/(main)/(tabs)/chat.tsx` | Chat tab screen (empty state + conversation list) |
| `apps/mobile/app/(main)/(tabs)/index.tsx` | Home tab (current dashboard, moved) |
| `apps/mobile/app/(main)/(tabs)/vault.tsx` | Vault tab screen (masonry grid) |
| `apps/mobile/app/(main)/chat/[id].tsx` | Conversation detail screen |
| `apps/mobile/app/(main)/vault/[id].tsx` | Save detail screen |
| `apps/mobile/src/components/chat/chat-input.tsx` | Grok-style input box |
| `apps/mobile/src/components/chat/message-bubble.tsx` | User + assistant message bubbles |
| `apps/mobile/src/components/chat/tool-indicator.tsx` | Tool call pill indicator |
| `apps/mobile/src/components/chat/empty-state.tsx` | Chat greeting + suggestions |
| `apps/mobile/src/components/chat/conversation-row.tsx` | Conversation list item |
| `apps/mobile/src/components/vault/save-card.tsx` | Individual save card |
| `apps/mobile/src/components/vault/save-grid.tsx` | Masonry two-column grid |
| `apps/mobile/src/components/vault/filter-chips.tsx` | All/Articles/Images filter |
| `apps/mobile/src/components/vault/save-fab.tsx` | Vault-specific FAB + bottom sheet |
| `apps/mobile/src/hooks/use-websocket.ts` | WebSocket connection hook |
| `apps/mobile/src/hooks/use-chat-store.ts` | Zustand store for chat streaming state |

### Mobile — Modified Files

| File | Change |
|------|--------|
| `apps/mobile/app/(main)/_layout.tsx` | Add `(tabs)` group, `chat/[id]`, `vault/[id]` routes to Stack |
| `apps/mobile/src/components/dashboard/dashboard-header.tsx` | Remove XP/level/streak, accept `activeTab` + `onTabChange` props, render 3 chips |
| `apps/mobile/app/(main)/index.tsx` | Delete (moved to `(tabs)/index.tsx`) |

---

## Task 1: Database Migration for Chat

**Files:**
- Create: `server/migrations/000004_chat.up.sql`
- Create: `server/migrations/000004_chat.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- server/migrations/000004_chat.up.sql

CREATE TABLE IF NOT EXISTS mindmap_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_conversations_user_id ON mindmap_conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON mindmap_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS mindmap_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES mindmap_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    attachments JSONB,
    tool_calls JSONB,
    tool_call_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON mindmap_messages(conversation_id);
CREATE INDEX idx_messages_created_at ON mindmap_messages(created_at);
```

- [ ] **Step 2: Write down migration**

```sql
-- server/migrations/000004_chat.down.sql

DROP TABLE IF EXISTS mindmap_messages;
DROP TABLE IF EXISTS mindmap_conversations;
```

- [ ] **Step 3: Run migration**

Run: `cd server && migrate -path migrations -database $DATABASE_URL up`
Expected: `4/up` success message

- [ ] **Step 4: Verify tables exist**

Run: `cd server && psql $DATABASE_URL -c "\dt mindmap_conversations" -c "\dt mindmap_messages"`
Expected: Both tables listed

- [ ] **Step 5: Commit**

```bash
cd server && git add migrations/000004_chat.up.sql migrations/000004_chat.down.sql
git commit -m "feat(chat): add conversations and messages migration"
```

---

## Task 2: sqlc Queries for Chat

**Files:**
- Create: `server/internal/store/queries/conversations.sql`
- Create: `server/internal/store/queries/messages.sql`
- Regenerate: `server/internal/store/` (sqlc generate)

- [ ] **Step 1: Write conversation queries**

```sql
-- server/internal/store/queries/conversations.sql

-- name: CreateConversation :one
INSERT INTO mindmap_conversations (user_id)
VALUES ($1)
RETURNING id, user_id, title, created_at, updated_at;

-- name: GetConversation :one
SELECT id, user_id, title, created_at, updated_at
FROM mindmap_conversations
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListConversations :many
SELECT id, user_id, title, created_at, updated_at
FROM mindmap_conversations
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: CountConversations :one
SELECT count(*) FROM mindmap_conversations
WHERE user_id = $1 AND deleted_at IS NULL;

-- name: UpdateConversationTitle :exec
UPDATE mindmap_conversations
SET title = $3, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: TouchConversation :exec
UPDATE mindmap_conversations
SET updated_at = now()
WHERE id = $1;

-- name: SoftDeleteConversation :exec
UPDATE mindmap_conversations
SET deleted_at = now()
WHERE id = $1 AND user_id = $2;
```

- [ ] **Step 2: Write message queries**

```sql
-- server/internal/store/queries/messages.sql

-- name: CreateMessage :one
INSERT INTO mindmap_messages (conversation_id, role, content, attachments, tool_calls, tool_call_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at;

-- name: ListMessages :many
SELECT id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at
FROM mindmap_messages
WHERE conversation_id = $1
ORDER BY created_at ASC
LIMIT $2 OFFSET $3;

-- name: CountMessages :one
SELECT count(*) FROM mindmap_messages
WHERE conversation_id = $1;

-- name: GetMessage :one
SELECT id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at
FROM mindmap_messages
WHERE id = $1;
```

- [ ] **Step 3: Run sqlc generate**

Run: `cd server && sqlc generate`
Expected: Clean output, no errors. New files generated in `internal/store/`

- [ ] **Step 4: Verify generated code compiles**

Run: `cd server && go build ./...`
Expected: No compile errors

- [ ] **Step 5: Commit**

```bash
cd server && git add internal/store/queries/conversations.sql internal/store/queries/messages.sql internal/store/
git commit -m "feat(chat): add sqlc queries for conversations and messages"
```

---

## Task 3: Chat REST Handlers

**Files:**
- Create: `server/internal/handler/chat.go`
- Modify: `server/cmd/api/main.go` (add routes)
- Modify: `packages/api-spec/openapi.yaml` (add schemas)

- [ ] **Step 1: Write chat handler**

Create `server/internal/handler/chat.go`. Follow the exact pattern from `saves.go`:
- `ChatHandler` struct with `queries store.Querier` and `maxFileSize int64`
- `NewChatHandler(queries store.Querier, maxFileSize int64) *ChatHandler`
- Methods: `ListConversations`, `GetMessages`, `DeleteConversation`, `UploadAttachment`

`ListConversations`:
- Extract `userID` from context via `middleware.UserIDFromContext(r)`
- Parse `limit` (default 20, max 100) and `offset` (default 0) from query params
- Call `queries.ListConversations(ctx, userID, limit, offset)` and `queries.CountConversations(ctx, userID)`
- Return JSON `{"items": [...], "total": N}`

`GetMessages`:
- Extract `userID`, parse conversation `id` from URL via `GetUUIDParam(r, "id")`
- Verify conversation ownership: `queries.GetConversation(ctx, id, userID)` — 404 if not found
- Parse `limit` (default 50, max 100) and `offset` (default 0)
- Call `queries.ListMessages(ctx, conversationID, limit, offset)` and `queries.CountMessages(ctx, conversationID)`
- Return JSON `{"items": [...], "total": N}`

`DeleteConversation`:
- Extract `userID`, parse `id`
- Call `queries.SoftDeleteConversation(ctx, id, userID)`
- Return 204

`UploadAttachment`:
- Parse multipart form with `maxFileSize` limit
- Validate MIME type (image/jpeg, image/png, image/webp, application/pdf)
- Save to storage with `chat/{userID}/{uuid}/{filename}` key
- Return JSON `{"media_key": "...", "filename": "...", "mime_type": "...", "size": N}`

- [ ] **Step 2: Register routes in main.go**

In `server/cmd/api/main.go`, inside the protected routes group (after the existing saves routes), add:

```go
chatHandler := handler.NewChatHandler(queries, cfg.MaxFileSize)
r.Get("/conversations", chatHandler.ListConversations)
r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
r.Delete("/conversations/{id}", chatHandler.DeleteConversation)
r.Post("/chat/attachments", chatHandler.UploadAttachment)
```

- [ ] **Step 3: Add OpenAPI schema**

Add conversation and message schemas + endpoints to `packages/api-spec/openapi.yaml`, following the existing patterns for saves endpoints. Add:
- `ConversationListItem` schema (id, title, created_at, updated_at)
- `MessageItem` schema (id, role, content, attachments, tool_calls, tool_call_id, created_at)
- `GET /conversations`, `GET /conversations/{id}/messages`, `DELETE /conversations/{id}`, `POST /chat/attachments` paths

- [ ] **Step 4: Build and verify**

Run: `cd server && go build ./cmd/api`
Expected: Clean compile

- [ ] **Step 5: Commit**

```bash
cd server && git add internal/handler/chat.go cmd/api/main.go
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2 && git add packages/api-spec/openapi.yaml
git commit -m "feat(chat): add REST endpoints for conversations, messages, attachments"
```

---

## Task 4: LLM Streaming Interface

**Files:**
- Modify: `server/internal/providers/llm/interface.go`
- Modify: `server/internal/providers/llm/gemini.go`

- [ ] **Step 1: Add streaming types to interface**

In `server/internal/providers/llm/interface.go`, add alongside existing types:

```go
// StreamDelta represents one chunk of a streaming response
type StreamDelta struct {
	Content      string   // Text token(s)
	ToolCalls    []ToolCall // Tool calls (if any in this chunk)
	FinishReason string   // Empty until final chunk
}

type ToolCall struct {
	ID       string
	Name     string
	Arguments string // JSON string
}

// StreamCallback is called for each delta during streaming
type StreamCallback func(delta StreamDelta) error
```

Add `StreamComplete` to the `LLMProvider` interface (note: `Complete` returns `*LLMResponse` pointer — match existing signature):

```go
type LLMProvider interface {
	Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error)
	StreamComplete(ctx context.Context, req LLMRequest, tools []ToolDefinition, callback StreamCallback) error
	Name() string
}
```

Add tool definition type:

```go
type ToolDefinition struct {
	Name        string
	Description string
	Parameters  map[string]interface{} // JSON Schema
}
```

- [ ] **Step 2: Implement Gemini streaming**

In `server/internal/providers/llm/gemini.go`, implement `StreamComplete` using the Gemini SDK's streaming API (`client.Models.GenerateContentStream`):

- Convert `ToolDefinition` slice to Gemini `genai.Tool` format
- Build content parts from `LLMRequest` (system prompt, user prompt, images)
- Call `client.Models.GenerateContentStream(ctx, model, contents, config)`
- Iterate the stream, calling `callback` with each `StreamDelta`
- Parse tool calls from Gemini's `FunctionCall` parts
- Set `FinishReason` on the final chunk

Refer to existing `Complete` method in gemini.go (line ~30-80) for the content building pattern.

- [ ] **Step 3: Build and verify**

Run: `cd server && go build ./...`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
cd server && git add internal/providers/llm/interface.go internal/providers/llm/gemini.go
git commit -m "feat(chat): add LLM streaming interface and Gemini implementation"
```

---

## Task 5: Chat Tools

**Files:**
- Create: `server/internal/chat/tools.go`
- Create: `server/internal/chat/tools_test.go`

- [ ] **Step 1: Write tool definitions and executor**

Create `server/internal/chat/tools.go`:

```go
package chat

// ToolRegistry holds all available chat tools
type ToolRegistry struct {
    queries store.Querier
    search  *search.SemanticSearch // nil if saves feature disabled
}

func NewToolRegistry(queries store.Querier, search *search.SemanticSearch) *ToolRegistry

// Definitions returns LLM tool definitions for all registered tools
func (r *ToolRegistry) Definitions() []llm.ToolDefinition

// Execute runs a tool by name with the given args, scoped to userID
func (r *ToolRegistry) Execute(ctx context.Context, userID string, toolName string, argsJSON string) (interface{}, error)
```

Implement 16 tools as specified in the design spec:
- `list_goals`, `create_goal`, `update_goal`, `delete_goal`
- `list_habits`, `create_habit`, `toggle_habit`
- `list_journals`, `create_journal`, `update_journal`, `delete_journal`
- `list_projects`, `create_project`
- `search_vault`, `get_vault_item`

Each tool:
1. Parses args from JSON string into a typed struct
2. Calls the appropriate sqlc query method (already exists in `store.Querier`)
3. Returns a result struct that will be JSON-serialized back to the LLM

Example for `list_goals`:
```go
func (r *ToolRegistry) listGoals(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
    var args struct {
        Status    *string `json:"status"`
        ProjectID *string `json:"project_id"`
    }
    if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
        return nil, fmt.Errorf("invalid args: %w", err)
    }
    // Call existing query methods
    goals, err := r.queries.ListGoals(ctx, store.ListGoalsParams{...})
    if err != nil {
        return nil, err
    }
    // Return simplified response for LLM
    return map[string]interface{}{"goals": simplifyGoals(goals)}, nil
}
```

- [ ] **Step 2: Write tests for tool execution**

Create `server/internal/chat/tools_test.go`:

Test each tool category (goals, habits, journals, projects, vault) with:
- Valid args → expected result shape
- Invalid args → error
- Empty results → empty array (not null)

Use the existing test database setup pattern from the server tests.

- [ ] **Step 3: Run tests**

Run: `cd server && go test ./internal/chat/ -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
cd server && git add internal/chat/
git commit -m "feat(chat): add tool definitions and execution for LLM function calling"
```

---

## Task 6: WebSocket Handler + Chat Orchestrator

**Files:**
- Create: `server/internal/handler/ws.go`
- Create: `server/internal/chat/orchestrator.go`
- Modify: `server/cmd/api/main.go` (add WS route)

- [ ] **Step 1: Write the WebSocket handler**

Create `server/internal/handler/ws.go`:

```go
package handler

import (
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin:     func(r *http.Request) bool { return true },
}

type WSHandler struct {
    orchestrator *chat.Orchestrator
}

func NewWSHandler(orchestrator *chat.Orchestrator) *WSHandler

// HandleChat upgrades to WebSocket. Auth via ?token= query param.
func (h *WSHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
    // 1. Extract token from query param
    // 2. Validate JWT (reuse existing JWT validation logic from middleware)
    // 3. Upgrade connection
    // 4. Start read/write goroutines
    // 5. Ping/pong every 30s, 5min idle timeout
}
```

Connection lifecycle:
- Read loop: parse JSON messages (`message.send`, `message.cancel`), dispatch to orchestrator
- Write loop: receives messages from orchestrator via a channel, writes JSON to WebSocket
- On `message.send`: call `orchestrator.HandleMessage(ctx, userID, msg, writeChan)`
- On `message.cancel`: cancel the active context
- On disconnect: clean up

- [ ] **Step 2: Write the chat orchestrator**

Create `server/internal/chat/orchestrator.go`:

```go
package chat

type Orchestrator struct {
    queries   store.Querier
    llmChain  *providers.Chain[llm.LLMProvider]
    tools     *ToolRegistry
}

func NewOrchestrator(queries store.Querier, llmChain *providers.Chain[llm.LLMProvider], tools *ToolRegistry) *Orchestrator
```

`HandleMessage(ctx, userID, msg, writeChan)`:
1. If `conversation_id` is null → create new conversation via `queries.CreateConversation`
2. Save user message via `queries.CreateMessage`
3. Load conversation history via `queries.ListMessages` (last 50 messages for context)
4. Build LLM request with system prompt + conversation history + tool definitions
5. Call `StreamComplete` with callback that sends `stream.delta` events to `writeChan`
6. If LLM returns tool calls:
   a. Send `stream.tool_call` event
   b. Execute tool via `ToolRegistry.Execute`
   c. Send `stream.tool_result` event
   d. Save tool message to DB
   e. Re-call LLM with tool result appended (loop until no more tool calls, max 5 iterations to prevent runaway)
7. On stream end: save complete assistant message to DB, send `stream.end`
8. If new conversation: generate title via a separate LLM call, send `conversation.title`, update DB
9. Touch conversation `updated_at`

System prompt should describe MindTab as a personal assistant with access to the user's goals, habits, journals, projects, and saved vault items.

- [ ] **Step 3: Register WebSocket route**

In `server/cmd/api/main.go`, add the WebSocket endpoint. It should NOT be inside the Chi auth middleware group since WebSocket auth is handled via query param:

```go
// WebSocket endpoint (auth via query param, not middleware)
// Note: registry.LLM is a public field (not a method) — see server/internal/providers/registry.go
// registry is only initialized when cfg.RedisURL != "" — ensure chat setup is inside that same block
orchestrator := chat.NewOrchestrator(queries, registry.LLM, toolRegistry)
wsHandler := handler.NewWSHandler(orchestrator)
r.Get("/ws/chat", wsHandler.HandleChat)
```

- [ ] **Step 4: Build and verify**

Run: `cd server && go build ./cmd/api`
Expected: Clean compile

- [ ] **Step 5: Commit**

```bash
cd server && git add internal/handler/ws.go internal/chat/orchestrator.go cmd/api/main.go
git commit -m "feat(chat): add WebSocket handler and chat orchestrator with streaming"
```

---

## Task 7: Mobile — Route Restructuring

**Files:**
- Create: `apps/mobile/app/(main)/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(main)/(tabs)/chat.tsx` (placeholder)
- Move: `apps/mobile/app/(main)/index.tsx` → `apps/mobile/app/(main)/(tabs)/index.tsx`
- Create: `apps/mobile/app/(main)/(tabs)/vault.tsx` (placeholder)
- Create: `apps/mobile/app/(main)/chat/[id].tsx` (placeholder)
- Create: `apps/mobile/app/(main)/vault/[id].tsx` (placeholder)
- Modify: `apps/mobile/app/(main)/_layout.tsx`

- [ ] **Step 1: Create the tab layout**

Create `apps/mobile/app/(main)/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";
import { colors } from "~/styles/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" }, // Hidden — we use header chips instead
      }}
    >
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="vault" options={{ title: "Vault" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Move dashboard to tabs/index.tsx**

Move `apps/mobile/app/(main)/index.tsx` to `apps/mobile/app/(main)/(tabs)/index.tsx`. Content stays identical for now.

- [ ] **Step 3: Create placeholder chat and vault tabs**

Create `apps/mobile/app/(main)/(tabs)/chat.tsx`:
```tsx
import { View, Text } from "react-native";
import { colors } from "~/styles/colors";

export default function ChatTab() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.text.primary }}>Chat</Text>
    </View>
  );
}
```

Create `apps/mobile/app/(main)/(tabs)/vault.tsx` with same pattern ("Vault" text).

- [ ] **Step 4: Create placeholder detail screens**

Create `apps/mobile/app/(main)/chat/[id].tsx`:
```tsx
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { colors } from "~/styles/colors";

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.text.primary }}>Conversation {id}</Text>
    </View>
  );
}
```

Create `apps/mobile/app/(main)/vault/[id].tsx` with same pattern.

- [ ] **Step 5: Update main layout**

Modify `apps/mobile/app/(main)/_layout.tsx` to include the new routes. Replace the current `index` screen with the `(tabs)` group, and add `chat/[id]` and `vault/[id]` as stack screens:

```tsx
<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
<Stack.Screen
  name="chat/[id]"
  options={{
    title: "",
    headerStyle: { backgroundColor: colors.bg.primary },
    headerTintColor: colors.text.primary,
  }}
/>
<Stack.Screen
  name="vault/[id]"
  options={{
    title: "Vault",
    headerStyle: { backgroundColor: colors.bg.primary },
    headerTintColor: colors.text.primary,
  }}
/>
```

Remove the old `<Stack.Screen name="index" .../>` entry.

- [ ] **Step 6: Delete old index.tsx**

Delete `apps/mobile/app/(main)/index.tsx` (now lives at `(tabs)/index.tsx`).

- [ ] **Step 7: Verify app launches and tabs switch**

Run: `cd apps/mobile && npx expo start`
Expected: App launches, three tabs exist (hidden tab bar), Home tab shows current dashboard. Navigate between placeholder Chat/Vault tabs via dev tools or back button.

- [ ] **Step 8: Commit**

```bash
cd apps/mobile && git add app/(main)/
git commit -m "feat(mobile): restructure navigation with tabs group (chat/home/vault)"
```

---

## Task 8: Header Redesign with Tab Chips

**Files:**
- Modify: `apps/mobile/src/components/dashboard/dashboard-header.tsx`
- Modify: `apps/mobile/app/(main)/(tabs)/_layout.tsx`

- [ ] **Step 1: Rewrite dashboard-header.tsx**

Strip out XP bar, level badge, streak flame. Add tab chips. New props:

```tsx
type DashboardHeaderProps = {
  activeTab: "chat" | "index" | "vault";
  onTabChange: (tab: "chat" | "index" | "vault") => void;
};
```

Layout: `[Avatar] [flex spacer] [Chat chip] [Home chip] [Vault chip] [flex spacer] [Search icon]`

Chip styling (monochromatic):
- Active: `{ backgroundColor: "#ffffff", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }`
- Active text: `{ color: "#0a0a0a", fontSize: 13, fontWeight: "600" }`
- Inactive: `{ backgroundColor: "transparent", borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }`
- Inactive text: `{ color: "#666666", fontSize: 13 }`

Keep avatar (left) and search icon (right) exactly as they are now. Remove all XP/level/streak related code and imports.

- [ ] **Step 2: Wire header into tab layout**

Update `apps/mobile/app/(main)/(tabs)/_layout.tsx` to render `DashboardHeader` as a custom tab bar:

```tsx
import { Tabs, usePathname, useRouter } from "expo-router";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab = pathname.includes("/chat")
    ? "chat"
    : pathname.includes("/vault")
    ? "vault"
    : "index";

  const handleTabChange = (tab: "chat" | "index" | "vault") => {
    router.replace(`/(main)/(tabs)/${tab === "index" ? "" : tab}`);
  };

  return (
    <>
      <DashboardHeader activeTab={activeTab} onTabChange={handleTabChange} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      >
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="index" />
        <Tabs.Screen name="vault" />
      </Tabs>
    </>
  );
}
```

- [ ] **Step 3: Verify header renders with chips**

Run: `cd apps/mobile && npx expo start`
Expected: Header shows avatar, three chips (Chat/Home/Vault), search icon. Tapping chips switches tabs. Active chip is white filled, inactive are outlined.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/components/dashboard/dashboard-header.tsx app/(main)/(tabs)/_layout.tsx
git commit -m "feat(mobile): redesign header with tab chips, remove XP/streak"
```

---

## Task 9: WebSocket Hook + Chat Store

**Files:**
- Create: `apps/mobile/src/hooks/use-websocket.ts`
- Create: `apps/mobile/src/hooks/use-chat-store.ts`

- [ ] **Step 1: Create Zustand chat store**

Create `apps/mobile/src/hooks/use-chat-store.ts`:

```tsx
import { create } from "zustand";

type ToolCallState = {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "calling" | "done";
};

type ChatState = {
  activeConversationId: string | null;
  streamingMessageId: string | null;
  streamBuffer: string;
  isStreaming: boolean;
  pendingToolCalls: ToolCallState[];

  setActiveConversation: (id: string | null) => void;
  startStream: (messageId: string) => void;
  appendDelta: (content: string) => void;
  addToolCall: (tool: string, args: Record<string, unknown>) => void;
  resolveToolCall: (tool: string, result: unknown) => void;
  endStream: () => void;
  reset: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  streamingMessageId: null,
  streamBuffer: "",
  isStreaming: false,
  pendingToolCalls: [],

  setActiveConversation: (id) => set({ activeConversationId: id }),
  startStream: (messageId) =>
    set({ streamingMessageId: messageId, streamBuffer: "", isStreaming: true, pendingToolCalls: [] }),
  appendDelta: (content) =>
    set((state) => ({ streamBuffer: state.streamBuffer + content })),
  addToolCall: (tool, args) =>
    set((state) => ({
      pendingToolCalls: [...state.pendingToolCalls, { tool, args, status: "calling" }],
    })),
  resolveToolCall: (tool, result) =>
    set((state) => ({
      pendingToolCalls: state.pendingToolCalls.map((tc) =>
        tc.tool === tool && tc.status === "calling" ? { ...tc, result, status: "done" } : tc
      ),
    })),
  endStream: () => set({ isStreaming: false, streamingMessageId: null }),
  reset: () =>
    set({
      activeConversationId: null,
      streamingMessageId: null,
      streamBuffer: "",
      isStreaming: false,
      pendingToolCalls: [],
    }),
}));
```

- [ ] **Step 2: Create WebSocket hook**

Create `apps/mobile/src/hooks/use-websocket.ts`:

```tsx
import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "./use-chat-store";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "~/lib/auth";

const WS_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/^http/, "ws") || "ws://localhost:8080";

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const store = useChatStore();

  const connect = useCallback(async () => {
    const token = await getAccessToken();
    if (!token || ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(`${WS_URL}/ws/chat?token=${token}`);
    ws.current = socket;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "stream.start":
          store.startStream(msg.message_id);
          if (msg.conversation_id) store.setActiveConversation(msg.conversation_id);
          break;
        case "stream.delta":
          store.appendDelta(msg.content);
          break;
        case "stream.tool_call":
          store.addToolCall(msg.tool, msg.args);
          break;
        case "stream.tool_result":
          store.resolveToolCall(msg.tool, msg.result);
          break;
        case "stream.end":
          store.endStream();
          // Invalidate message cache to include the completed message
          queryClient.invalidateQueries({ queryKey: ["messages", store.activeConversationId] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;
        case "conversation.title":
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;
        case "error":
          store.endStream();
          // Handle error (show toast, etc.)
          break;
      }
    };

    socket.onclose = () => {
      ws.current = null;
      // Auto-reconnect after 3s if not intentional
      setTimeout(connect, 3000);
    };
  }, []);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  const sendMessage = useCallback(
    (content: string, conversationId?: string | null, attachments?: string[]) => {
      if (ws.current?.readyState !== WebSocket.OPEN) return;
      ws.current.send(
        JSON.stringify({
          type: "message.send",
          conversation_id: conversationId || null,
          content,
          attachments: attachments || [],
        })
      );
    },
    []
  );

  const cancelStream = useCallback(() => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ type: "message.cancel" }));
  }, []);

  return { connect, disconnect, sendMessage, cancelStream, isConnected: ws.current?.readyState === WebSocket.OPEN };
}
```

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add src/hooks/use-websocket.ts src/hooks/use-chat-store.ts
git commit -m "feat(mobile): add WebSocket hook and Zustand chat store"
```

---

## Task 10: Chat Empty State + Conversation List

**Files:**
- Create: `apps/mobile/src/components/chat/empty-state.tsx`
- Create: `apps/mobile/src/components/chat/conversation-row.tsx`
- Modify: `apps/mobile/app/(main)/(tabs)/chat.tsx`

- [ ] **Step 1: Create empty state component**

Create `apps/mobile/src/components/chat/empty-state.tsx`:

- Centered vertically: "MindTab" title (#fafafa, 22px, weight 600) + "Your personal assistant" subtitle (#555, 14px)
- 4 suggestion chips below in a flex-wrap row, centered:
  - "What are my active goals?"
  - "Summarize my saved articles"
  - "Create a new habit"
  - "How was my week?"
- Each chip: `borderWidth: 1, borderColor: "#222", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8`
- Chip text: `color: "#888", fontSize: 13`
- `onSuggestionPress` prop callback

- [ ] **Step 2: Create conversation row component**

Create `apps/mobile/src/components/chat/conversation-row.tsx`:

- Row with title + relative timestamp, right chevron
- Background: `#111`, borderRadius: 10, padding: 10px 12px
- Title: `#e0e0e0`, 14px
- Timestamp: `#444`, 12px
- `onPress` prop navigates to `/(main)/chat/[id]`

- [ ] **Step 3: Wire up chat.tsx**

Replace placeholder `apps/mobile/app/(main)/(tabs)/chat.tsx` with:

- Fetch conversations via React Query: `useQuery({ queryKey: ["conversations"], queryFn: ... })`
- Render `ChatEmptyState` in center
- Render recent conversations list below (section label "RECENT", uppercase #555 11px)
- Render `ChatInput` at bottom (from next task — for now render placeholder)
- `SafeAreaView` with `flex: 1, backgroundColor: colors.bg.primary`

- [ ] **Step 4: Verify renders**

Run: `cd apps/mobile && npx expo start`
Expected: Chat tab shows empty state with greeting and suggestion chips.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile && git add src/components/chat/ app/(main)/(tabs)/chat.tsx
git commit -m "feat(mobile): add chat empty state and conversation list"
```

---

## Task 11: Chat Input Box

**Files:**
- Create: `apps/mobile/src/components/chat/chat-input.tsx`

- [ ] **Step 1: Build the Grok-style input**

Create `apps/mobile/src/components/chat/chat-input.tsx`:

Props:
```tsx
type ChatInputProps = {
  onSend: (text: string, attachments: string[]) => void;
  disabled?: boolean;
};
```

Structure:
- Outer container: `backgroundColor: "#141414", borderRadius: 20, borderWidth: 1, borderColor: "#222", padding: 14px 16px 10px`
- `TextInput` on top: placeholder "Ask anything...", placeholderTextColor "#444", multiline, max height ~120px, auto-grow
- Action row below (flexDirection: row, justifyContent: space-between):
  - Left group: Paperclip button (36x36 circle, bg #1c1c1c, icon #777)
  - Right group: Mic button (36x36, bg #1c1c1c, icon #777, non-functional) + Send button (36x36, bg #fff when text present / bg #333 when empty, icon color #0a0a0a / #666)
- Attachment preview row (above TextInput, inside container): horizontal scroll of thumbnail chips with × remove button, shown only when attachments exist
- Paperclip tap → `expo-image-picker` or `expo-document-picker` → upload via `POST /chat/attachments` → store media_key
- Send button disabled (dimmed) when text is empty and no attachments
- On send: call `onSend(text, mediaKeys)`, clear input + attachments
- `KeyboardAvoidingView` behavior handled by parent screen

- [ ] **Step 2: Integrate into chat tab**

Replace the placeholder input in `apps/mobile/app/(main)/(tabs)/chat.tsx` with `<ChatInput>`. Wire `onSend` to the WebSocket `sendMessage` function.

- [ ] **Step 3: Verify input renders and types**

Run: `cd apps/mobile && npx expo start`
Expected: Input box renders at bottom of chat tab. Can type text. Send button lights up white when text present. Paperclip opens picker.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/components/chat/chat-input.tsx app/(main)/(tabs)/chat.tsx
git commit -m "feat(mobile): add Grok-style chat input with attachment support"
```

---

## Task 12: Chat Messages + Streaming

**Files:**
- Create: `apps/mobile/src/components/chat/message-bubble.tsx`
- Create: `apps/mobile/src/components/chat/tool-indicator.tsx`
- Modify: `apps/mobile/app/(main)/chat/[id].tsx`

- [ ] **Step 1: Create message bubble component**

Create `apps/mobile/src/components/chat/message-bubble.tsx`:

```tsx
type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; args: unknown; result?: unknown; status: string }[];
  isStreaming?: boolean;
};
```

User bubble:
- `alignSelf: "flex-end"`, maxWidth: "80%"
- `backgroundColor: "#ffffff"`, `color: "#0a0a0a"`
- `borderRadius: 18` with `borderBottomRightRadius: 4`
- `fontWeight: "450"`, fontSize: 14, lineHeight: 21

Assistant bubble:
- `alignSelf: "flex-start"`, maxWidth: "85%"
- `backgroundColor: "#141414"`, `color: "#e0e0e0"`
- `borderRadius: 18` with `borderTopLeftRadius: 4`
- fontSize: 14, lineHeight: 22.4
- Render markdown content (bold, lists, code blocks) — use a simple regex-based renderer or `react-native-markdown-display`

Streaming state:
- When `isStreaming && content === ""`: show three dots (5px circles at #555, #888, #bbb)
- When `isStreaming && content !== ""`: show content + blinking cursor ("|" with opacity animation)

- [ ] **Step 2: Create tool indicator component**

Create `apps/mobile/src/components/chat/tool-indicator.tsx`:

- Small pill rendered above assistant bubble
- `backgroundColor: "#111"`, `borderWidth: 1, borderColor: "#1a1a1a"`, `borderRadius: 8`
- Icon: "⚡" if status === "calling", "✓" if status === "done"
- Text: short description (e.g., "Checking your goals") in `#666`, fontSize: 12
- Tappable: expands to show tool args/result JSON (collapsible)

- [ ] **Step 3: Build conversation detail screen**

Replace placeholder `apps/mobile/app/(main)/chat/[id].tsx`:

- Header: back button + conversation title + three-dot menu (delete option)
- `FlatList` of messages fetched via React Query: `useQuery({ queryKey: ["messages", id], queryFn: ... })`
- Append streaming message from `useChatStore` at the end of the list
- Each item renders `ToolIndicator` (if tool_calls) + `MessageBubble`
- Auto-scroll to bottom on new messages (`onContentSizeChange`)
- `ChatInput` at bottom, wired to WebSocket `sendMessage` with `conversationId`
- `KeyboardAvoidingView` wrapping the screen

- [ ] **Step 4: Wire suggestion chips to create conversation**

In `apps/mobile/app/(main)/(tabs)/chat.tsx`, when a suggestion chip is tapped:
1. Connect WebSocket if not connected
2. Call `sendMessage(suggestionText, null)` — null conversation_id creates a new one
3. Listen for `stream.start` with the new `conversation_id`
4. Navigate to `/(main)/chat/[conversation_id]`

Same flow for typing in the input box on the chat tab.

- [ ] **Step 5: Verify end-to-end chat flow**

Run: `cd apps/mobile && npx expo start` (with server running)
Expected: Type message → WebSocket sends → streaming tokens appear → message completes → persisted in history.

- [ ] **Step 6: Commit**

```bash
cd apps/mobile && git add src/components/chat/ app/(main)/chat/
git commit -m "feat(mobile): add chat messages, streaming, tool indicators, conversation detail"
```

---

## Task 13: Vault Grid View

**Files:**
- Create: `apps/mobile/src/components/vault/save-card.tsx`
- Create: `apps/mobile/src/components/vault/save-grid.tsx`
- Create: `apps/mobile/src/components/vault/filter-chips.tsx`
- Modify: `apps/mobile/app/(main)/(tabs)/vault.tsx`

- [ ] **Step 1: Create filter chips component**

Create `apps/mobile/src/components/vault/filter-chips.tsx`:

- Horizontal row: `[All] [Articles] [Images]`
- Same chip styling as header tab chips (white fill active, outlined inactive)
- Props: `activeFilter: "all" | "article" | "image"`, `onFilterChange`

- [ ] **Step 2: Create save card component**

Create `apps/mobile/src/components/vault/save-card.tsx`:

Props: save item from `GET /saves` response.

Article card:
- `backgroundColor: "#141414"`, `borderRadius: 14`, `borderWidth: 1, borderColor: "#1a1a1a"`
- Optional thumbnail at top (if `source_thumbnail_url`)
- Title: `#e0e0e0`, 13px, weight 500, max 2 lines
- Snippet from summary: `#555`, 11px, max 2 lines
- Tags as small pills: `backgroundColor: "#1a1a1a"`, `color: "#666"`, 10px
- Source domain with link icon when `source_url` exists
- `onPress` navigates to `/(main)/vault/[id]`

Image card:
- Same structure but with image thumbnail (`Image` component loading from media URL)
- Show OCR excerpt if `extracted_text` exists

Processing card:
- 60% opacity, spinner + "Processing..." text, URL as title

- [ ] **Step 3: Create masonry grid component**

Create `apps/mobile/src/components/vault/save-grid.tsx`:

- Two-column masonry layout using two `FlatList` columns or a manual split approach:
  - Split items alternately into left/right arrays
  - Render two vertical columns side by side with `gap: 10`
- Pull-to-refresh support
- Infinite scroll: load more when reaching end (`onEndReached`)
- Props: `saves`, `onRefresh`, `onLoadMore`, `refreshing`

- [ ] **Step 4: Wire up vault.tsx**

Replace placeholder `apps/mobile/app/(main)/(tabs)/vault.tsx`:

- Fetch saves via React Query using existing API: `api.GET("/saves", { params: { query: { limit: 20, offset } } })`
- Local state for filter (`useState<"all" | "article" | "image">`)
- Client-side filter: `saves.filter(s => filter === "all" || s.source_type === filter)`
- Render `FilterChips` at top, `SaveGrid` below
- `SafeAreaView` with `flex: 1`

- [ ] **Step 5: Verify vault renders**

Run: `cd apps/mobile && npx expo start`
Expected: Vault tab shows filter chips and card grid (empty if no saves, cards if saves exist).

- [ ] **Step 6: Commit**

```bash
cd apps/mobile && git add src/components/vault/ app/(main)/(tabs)/vault.tsx
git commit -m "feat(mobile): add vault tab with masonry grid, filter chips, save cards"
```

---

## Task 14: Vault Detail View

**Files:**
- Modify: `apps/mobile/app/(main)/vault/[id].tsx`

- [ ] **Step 1: Build save detail screen**

Replace placeholder `apps/mobile/app/(main)/vault/[id].tsx`:

- Fetch save via React Query: `api.GET("/saves/{id}", { params: { path: { id } } })`
- Header: configured in `(main)/_layout.tsx` — back button + "Vault" title + share/delete icons
- Content sections (ScrollView):
  - **Source row:** Domain favicon + "domain.com · X min read" in `#555`
  - **Title:** `#fafafa`, 22px, weight 600
  - **Tags:** bordered pills, `backgroundColor: "#141414"`, `borderColor: "#1a1a1a"`, `color: "#888"`
  - **Summary:** `#ccc` text inside `backgroundColor: "#111"`, borderRadius 12, padding 14
  - **Key topics:** bulleted list with `#555` dots and `#bbb` text
  - **Extracted content:** `#999` text, scrollable, with "Scroll for full text →" hint
  - For images: full image at top instead of source row
- Bottom button: "Open Original Article ↗" — white full-width, opens `Linking.openURL(source_url)`
- Delete via `api.DELETE("/saves/{id}")` + navigate back

- [ ] **Step 2: Verify detail view**

Run: `cd apps/mobile && npx expo start`
Expected: Tapping a vault card pushes to detail screen with all sections rendered.

- [ ] **Step 3: Commit**

```bash
cd apps/mobile && git add app/(main)/vault/
git commit -m "feat(mobile): add vault save detail screen"
```

---

## Task 15: Vault FAB

**Files:**
- Create: `apps/mobile/src/components/vault/save-fab.tsx`
- Modify: `apps/mobile/app/(main)/(tabs)/vault.tsx`

- [ ] **Step 1: Create vault save FAB**

Create `apps/mobile/src/components/vault/save-fab.tsx`:

- White circle FAB (52x52), `+` icon, positioned bottom-right
- Tap opens a `BottomSheetModal` with two options:
  - "Save URL" — text input for URL + submit button, calls `api.POST("/saves", { body: { url } })`
  - "Save Image" — opens `expo-image-picker`, uploads image via `api.POST("/saves", { body: formData })` with multipart
- On success: invalidate saves query, close bottom sheet, show success toast
- Style: `position: absolute, bottom: 24, right: 16`
- Shadow: `shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, elevation: 8`

- [ ] **Step 2: Add to vault tab**

Import and render `<SaveFAB />` in `apps/mobile/app/(main)/(tabs)/vault.tsx`.

- [ ] **Step 3: Verify FAB works**

Run: `cd apps/mobile && npx expo start`
Expected: FAB visible on vault tab. Tap opens bottom sheet. Can save a URL or pick an image.

- [ ] **Step 4: Commit**

```bash
cd apps/mobile && git add src/components/vault/save-fab.tsx app/(main)/(tabs)/vault.tsx
git commit -m "feat(mobile): add vault FAB with URL/image save bottom sheet"
```

---

## Task 16: Home Tab Cleanup

**Files:**
- Modify: `apps/mobile/app/(main)/(tabs)/index.tsx`

- [ ] **Step 1: Clean up home tab**

In `apps/mobile/app/(main)/(tabs)/index.tsx`:
- Remove `DashboardHeader` import and render (now handled by tab layout)
- FAB and HabitsBubble stay on this tab only (they're already only rendered here)
- Verify all existing functionality still works (project pills, goals section, notes section, pull-to-refresh)

- [ ] **Step 2: Move XP display to profile modal**

In `apps/mobile/app/(modals)/profile.tsx`, add the XP progress bar that was removed from the header:
- Level badge, XP count, progress bar
- Reuse the existing XP calculation from `src/lib/xp.ts`

- [ ] **Step 3: Verify home tab works as before**

Run: `cd apps/mobile && npx expo start`
Expected: Home tab shows all current dashboard content. FAB and habits bubble work. No XP/streak in header. Profile modal shows XP.

- [ ] **Step 4: Final commit**

```bash
cd apps/mobile && git add app/(main)/(tabs)/index.tsx app/(modals)/profile.tsx
git commit -m "feat(mobile): clean up home tab, move XP display to profile modal"
```
