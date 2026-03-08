# Notes/Journal Reader — Spec Compliance Plan

> Generated: 2026-03-08
> Current compliance: **58%** (22 compliant, 23 partial, 13 missing)

## Priority Legend

- **P0** — Architectural / blocking other fixes
- **P1** — Core UX gaps visible to every user
- **P2** — Polish & spec precision
- **P3** — Advanced features (connected knowledge API)

---

## Phase 1: Architectural Fix — In-Place Edit Mode (P0)

The spec requires edit mode to happen **in-place within the reader**, not via navigation to a separate screen. This is the highest-priority fix because it blocks 5 other edit-mode items.

### Step 1.1: Add `isEditing` state to reader screen
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Add `const [isEditing, setIsEditing] = useState(false)` toggle
- Edit button toggles `isEditing` instead of `router.push`
- Follow the pattern already used by goals/habits/projects screens

### Step 1.2: Conditionally render editor in-place
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- When `isEditing`: replace the WebView reader with `RichTextEditor` component
- Title `<Text>` becomes `<Input>` (editable)
- Crossfade transition between reader and editor (150ms `withTiming`)

### Step 1.3: TenTap toolbar with spring entrance
- **File:** `apps/mobile/src/components/notes/rich-text-editor.tsx`
- Animate toolbar entrance with `withSpring` (slide up from bottom)
- Wrap in `Animated.View` with `translateY` driven by `isEditing`

### Step 1.4: Auto-save with 2-second debounce
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- `useEffect` with debounced save (2000ms) on content change
- Add explicit "Done" button (not "Save") that dismisses keyboard + exits edit mode

### Step 1.5: Unsaved changes prompt
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Track dirty state by comparing content against last-saved version
- Show alert on back/swipe-down if dirty

### Step 1.6: @Mention toolbar button
- **File:** `apps/mobile/src/components/notes/rich-text-editor.tsx`
- Add custom toolbar button for @Mention
- Typing `@` or tapping button opens a quick search bottom sheet
- Search goals/habits/notes, tap to insert mention span

### Step 1.7: Delete the separate edit screen
- **File:** `apps/mobile/app/(main)/notes/edit/[id].tsx`
- Remove once in-place editing is fully working

---

## Phase 2: Entry Transition (P1)

### Step 2.1: Card scale-up on press
- **File:** `apps/mobile/src/components/notes/note-card.tsx`
- **File:** `apps/mobile/src/components/dashboard/notes-section.tsx`
- On press begin: `withTiming(1.02, { duration: 100 })` (not scale-down to 0.97)

### Step 2.2: Dashboard fade-out
- **File:** `apps/mobile/src/components/dashboard/notes-section.tsx`
- Use a shared animated value or `SharedTransitionTag` to fade dashboard content (150ms) before navigation

### Step 2.3: Card-to-reader morph
- **Files:** note-card + `[id].tsx`
- Implement shared element transition using `react-native-reanimated` layout animations or React Navigation shared element transitions
- Card expands to full-screen with 300ms spring
- Requires capturing card layout coordinates and animating to full-screen bounds

### Step 2.4: Reader chrome delayed fade-in
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Set `headerVisible` initial value to `0`
- After 300ms + 100ms delay, animate to `1` using entering animation

---

## Phase 3: Mention System Fixes (P1)

### Step 3.1: Fix peek sheet data passing (BUG)
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (lines 172-176, 547-553)
- Expand `MentionEntity` type to include `status`, `priority`, `impact`, `projectName`, `streak`, `frequency`
- Fetch full entity data when mention is tapped (query by id + type) before opening peek sheet
- Pass complete data to `MentionPeekSheet`

### Step 3.2: Fix note mention navigation bug (BUG)
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (line 350)
- Change `case "journal"` to `case "note"` to match the `data-id="note:uuid"` format

### Step 3.3: Add icon to inline mention cards
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (`buildReaderHtml`)
- Inject icon (🎯 for goal, 🔄 for habit, 📝 for note) into mention card HTML before the label text

### Step 3.4: Add metadata to inline mention cards
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (`buildReaderHtml`)
- Render a second line inside the mention card with priority/status/streak metadata
- Requires preloading mentioned entity data when building HTML (or lazy-loading via WebView messages)

### Step 3.5: Add project folder to inline mention cards
- Same approach as Step 3.4 — add `📁 ProjectName` line to mention card HTML

### Step 3.6: Add "Created" date to peek sheet
- **File:** `apps/mobile/src/components/reader/mention-peek-sheet.tsx`
- Add `Created X days ago` row in the goal/habit details section
- Pull `createdAt` from entity data

### Step 3.7: Add XP burst on status change
- **File:** `apps/mobile/src/components/reader/mention-peek-sheet.tsx`
- After successful `updateGoal.mutate`, trigger XP burst animation behind the sheet
- Reuse existing XP animation components if available

### Step 3.8: Add Connected Habits section for goals
- **File:** `apps/mobile/src/components/reader/mention-peek-sheet.tsx`
- Add "Connected Habits" section to `GoalDetails` (currently only in `HabitDetails`)

---

## Phase 4: Chrome & Scroll Behavior Fixes (P2)

### Step 4.1: Fix scroll threshold to 50px absolute
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (lines 384-393)
- Change from relative 5px delta to: only hide header when `currentY > 50` AND scrolling downward

### Step 4.2: Fix fade-in duration to 150ms
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (line 280)
- Make `withTiming` duration conditional: 200ms for fade-out, 150ms for fade-in
- Use `headerVisible.value === 1 ? 150 : 200` or split into two animated styles

### Step 4.3: Extend tap-to-toggle to native title area
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Wrap the native title/meta section in a `Pressable` that also calls `toggleHeader()`

---

## Phase 5: Swipe & Exit Reader Polish (P2)

### Step 5.1: Add edge preview of adjacent note titles
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- During horizontal pan gesture, show the next/previous note title peeking in from the edge
- Render positioned absolutely at left/right edge, opacity tied to swipe translation

### Step 5.2: Implement true crossfade between notes
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Instead of fade-out → navigate → appear, crossfade current and incoming note
- May require pre-rendering next/previous note content off-screen

### Step 5.3: Allow swipe-down dismiss at any scroll position
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (line 407)
- Remove the `currentScrollY.current <= 0` guard
- Implement a two-finger or velocity-based detection to avoid conflict with normal scrolling

### Step 5.4: Add gesture-driven visual feedback on swipe-down
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Tie opacity and scale to the downward gesture's translationY
- Reader should shrink/fade as user drags down, snapping back if cancelled

### Step 5.5: Guard native iOS back gesture from custom pan conflict
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Add `failOffsetX` or hit-test exclusion for left 20px edge region
- Ensure the native iOS swipe-from-left-edge gesture takes priority

---

## Phase 6: Typography Precision (P2)

### ~~Step 6.0: Unify font to system sans-serif~~ ✅ DONE
- Reader WebView body: changed from `Georgia, serif` to `-apple-system, BlinkMacSystemFont, sans-serif`
- Native title: removed `fontFamily: Platform.select({ ios: "Georgia", default: "serif" })`
- Removed redundant explicit `font-family` on `h3` (inherits from body now)
- **Single font (system sans-serif) now used across entire app**

### Step 6.1: Fix title line-height
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Change `lineHeight: 36` to `lineHeight: 36.4` (28 × 1.3)

### Step 6.2: Add meta line-height
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Add `lineHeight: 19.6` (14 × 1.4) to meta text style

### Step 6.3: Fix H2 line-height
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (CSS)
- Change `line-height: 1.35` to `line-height: 1.3`

### Step 6.4: Add code line-height
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (CSS)
- Add `line-height: 1.5` to `code` CSS rule

### Step 6.5: Add @mention line-height
- **File:** `apps/mobile/app/(main)/notes/[id].tsx` (CSS)
- Add `line-height: 1.4` to `.mention` / `.mention-card` CSS rule

### Step 6.6: Use `readerTypography` tokens instead of hardcoded values
- **File:** `apps/mobile/app/(main)/notes/[id].tsx`
- Import and use `readerTypography` from `tokens.ts` for native styles
- Sync WebView CSS values with token definitions to eliminate duplication

---

## Phase 7: Connected Knowledge API (P3)

### Step 7.1: API endpoint for mention-based note lookup
- **File:** `server/` — new endpoint
- Query notes that contain mentions of a given entity (goal/habit/note ID)
- Returns list of connected notes with title and preview

### Step 7.2: API endpoint for connected habits
- **File:** `server/` — new endpoint
- Query habits linked to a goal via mentions

### Step 7.3: Replace peek sheet placeholders with real data
- **File:** `apps/mobile/src/components/reader/mention-peek-sheet.tsx`
- Replace "API support for mention-based note lookup is still required" placeholders
- Fetch and display connected notes (tappable — reader-to-reader navigation)
- Fetch and display connected habits with streak info

---

## Execution Order

```
Phase 1 (P0) → Phase 3 (P1) → Phase 2 (P1) → Phase 4 (P2) → Phase 6 (P2) → Phase 5 (P2) → Phase 7 (P3)
```

Phase 1 is the foundation — in-place editing unblocks all edit-mode items. Phase 3 fixes bugs and data flow issues. Phase 2 adds the premium entry transition. Phases 4-6 are polish. Phase 7 requires backend work.

---

## Expected Result

After all phases: **100% spec compliance** across all 58 spec items.
