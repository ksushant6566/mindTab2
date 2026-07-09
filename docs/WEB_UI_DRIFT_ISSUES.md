# Web UI Drift Issues

This document records the web-only UI architecture issues found after the sidebar hover/active regression. The goal is to make these issues durable and actionable so future UI work does not repeat the same failure pattern.

Use this document together with:

- `docs/WEB_UI_ARCHITECTURE.md`
- `docs/PLAYWRIGHT_E2E.md`
- `AGENTS.md`

For every fix below, run the common verification set unless the issue explicitly says otherwise:

```bash
corepack pnpm --filter @mindtab/web lint
corepack pnpm --filter @mindtab/web audit:ui
corepack pnpm --filter @mindtab/web audit:typography
corepack pnpm --filter @mindtab/web build
```

When the fix affects visible layout, navigation, theme, typography, settings, onboarding, or sidebar behavior, also run:

```bash
corepack pnpm --filter @mindtab/web e2e
```

## 1. Undefined Sidebar Tailwind Tokens

### Issue

`SidebarShell` still uses Tailwind color utilities that are not defined in the web Tailwind theme:

- `bg-sidebar`
- `text-sidebar-foreground`

These are the same type of issue as the recently fixed `sidebar-accent` regression: a class can look valid in TSX while producing no meaningful CSS because the theme key does not exist.

### Details

Current location:

- `apps/web/src/components/domain/navigation/index.tsx`

The current web Tailwind config defines colors such as `background`, `foreground`, `card`, `secondary`, `muted`, `primary`, and the `mt.*` token aliases. It does not define `sidebar`, `sidebar.foreground`, `sidebar-accent`, or `sidebar-accent-foreground`.

`SidebarShell` appears unused right now, so the bug is masked. The risk is that a future sidebar refactor may adopt `SidebarShell` and silently reintroduce invisible or inconsistent sidebar background/text styles.

### Proposed Fix

Replace `bg-sidebar text-sidebar-foreground` with actual app tokens:

- `bg-card text-card-foreground`, or
- `bg-[var(--bg-elev)] text-foreground`, depending on the intended sidebar surface.

Prefer a named sidebar frame primitive that is used by both the main app sidebar and settings sidebar. Avoid inventing new Tailwind semantic keys unless they are added to `tailwind.config.ts` and backed by CSS variables in `tokens.css`.

### Fix Reasoning

The platform is moving toward theme customization. All surface colors must resolve through the actual token system. A non-existent Tailwind token creates a silent visual no-op and is hard to detect by TypeScript or normal build checks.

### Verification To Run After Fix

Run the common verification set.

Run a targeted token scan:

```bash
rg -n -e "bg-sidebar" -e "text-sidebar" -e "sidebar-accent" apps/web/src
```

Expected result: no web TSX usage unless the keys have been intentionally added to `tailwind.config.ts` and `tokens.css`.

If the sidebar shell is changed visually, run:

```bash
corepack pnpm --filter @mindtab/web e2e
```

Manually inspect:

- Main app sidebar background and text.
- Settings sidebar background and text.
- Hover/active row feedback in both sidebars.

## 2. Fragmented Sidebar Primitives

### Issue

The actual sidebar navigation rows were previously different components/styles. The row state is now partially unified, but sidebar primitives are still fragmented.

### Details

Examples:

- `SidebarLogo` exists in `apps/web/src/components/domain/navigation/index.tsx`, but the app sidebar hardcodes logo markup and typography in `apps/web/src/components/domain/navigation/app-sidebar.tsx`.
- `SidebarShell`, `SidebarContent`, and section primitives exist, but the app sidebar builds its shell, scroll area, header, and collapsed behavior directly.
- Settings has its own sidebar frame primitive in `apps/web/src/components/patterns/settings/index.tsx`.

This means future agents can accidentally modify one sidebar path and not the other.

### Proposed Fix

Create a single shared sidebar primitive family, likely under `components/domain/navigation`:

- `SidebarFrame`
- `SidebarHeader`
- `SidebarLogo`
- `SidebarCollapseButton`
- `SidebarScrollArea`
- `SidebarNavItem`
- `SidebarSectionTrigger`
- `SidebarAccountArea`
- `SidebarAccountItem`
- `SidebarAccountPopover`

Then make both `AppSidebar` and `SettingsSidebar` compose these primitives.

Settings can still have a settings-specific section model, but the visual shell, row state, account area, and scroll behavior should be shared.

### Fix Reasoning

This directly addresses the original drift: two components that look similar but encode different hover/active behavior. A single row primitive prevents future visual divergence.

### Verification To Run After Fix

Run the common verification set and:

```bash
corepack pnpm --filter @mindtab/web e2e
```

Search for duplicate sidebar row styling:

```bash
rg -n "hover:bg|active &&|bg-secondary text-foreground|SidebarItem|SettingsNavItem|SidebarLogo" apps/web/src/components/domain/navigation apps/web/src/components/patterns/settings
```

Expected result:

- Sidebar hover/active styling is centralized.
- Settings nav rows delegate to the same shared row primitive.
- App sidebar account menu rows use the same row primitive.

Browser verify:

- Main sidebar active row.
- Main sidebar hovered row.
- Settings sidebar active row.
- Settings sidebar hovered row.
- Collapsed app sidebar expand behavior.
- Account row and account popover behavior.

## 3. Separate Settings Sidebar Shell

### Issue

The settings sidebar row now shares `SidebarItem`, but the settings sidebar shell itself is still independent from the main app sidebar shell.

### Details

Current settings shell components live in:

- `apps/web/src/components/patterns/settings/index.tsx`

The settings page also overrides sidebar classes directly in:

- `apps/web/src/components/patterns/settings/settings-page.tsx`

The main app sidebar builds its own frame in:

- `apps/web/src/components/domain/navigation/app-sidebar.tsx`

This leaves room for drift in background color, border, padding, account section spacing, scroll behavior, and hover gutters.

### Proposed Fix

Split sidebar concerns:

- Shared visual shell and account area live in `components/domain/navigation`.
- Settings-specific nav data and section labels live in `components/patterns/settings`.

`SettingsSidebar` should become a small composition wrapper around the shared sidebar frame primitives, not a separate visual system.

### Fix Reasoning

The settings page should feel like a dedicated page, but it should not reinvent sidebar visual behavior. Shared shell primitives keep app-wide navigation chrome coherent while still allowing settings-specific content.

### Verification To Run After Fix

Run the common verification set and:

```bash
corepack pnpm --filter @mindtab/web e2e
```

Browser verify:

- Settings sidebar account section matches the main sidebar account section.
- Settings row hover/active states match main sidebar row hover/active states.
- Settings sidebar scroll behavior does not shift content.
- Main sidebar and settings sidebar dividers, background, and account area spacing are intentionally aligned.

## 4. Command Menu And Settings Appearance Logic Drift

### Issue

The command menu and settings page use different appearance update logic.

### Details

The command menu hardcodes theme color values in:

- `apps/web/src/components/patterns/command-menu.tsx`

The settings page uses template-aware appearance resolution in:

- `apps/web/src/components/patterns/settings/settings-page.tsx`

This means changing theme from the command menu can reset the user's chosen template/colors to hardcoded values, while changing theme from settings preserves or resolves the selected template.

### Proposed Fix

Move appearance option resolution into a shared helper, for example:

- `apps/web/src/lib/appearance.ts`, or
- `packages/core/src/appearance.ts` if it should be shared beyond web.

The helper should expose:

- `appearanceThemeOptions`
- `appearanceTemplateOptions`
- `resolveAppearanceTemplateSettings(theme, template, prefersDark)`
- `resolveThemeChange(currentSettings, nextTheme, prefersDark)`
- `uiFontOptions`
- `codeFontOptions`

Then both command menu and settings should call the same functions.

### Fix Reasoning

Appearance behavior is product logic, not page-local UI logic. If theme/template/font logic is duplicated, settings and command menu will drift again.

### Verification To Run After Fix

Run the common verification set.

Run targeted source checks:

```bash
rg -n "backgroundColor: \"#|foregroundColor: \"#|accentColor: \"#|Theme: Dark|Theme: Light" apps/web/src/components/patterns/command-menu.tsx apps/web/src/components/patterns/settings/settings-page.tsx
```

Expected result:

- Hardcoded appearance options are removed from command menu.
- Settings and command menu import the same appearance helper.

Browser verify:

- Choose a non-Codex template in settings.
- Change dark/light/system from command menu.
- Confirm the app uses the same template resolution rules as settings.
- Confirm changes persist after refresh.

## 5. Font Presets Reference Fonts That Are Not Loaded

### Issue

The UI exposes font presets that may not actually load in web.

### Details

Core exposes UI font presets such as:

- `inter`
- `geist`
- `system`
- `satoshi`

Core exposes code font presets such as:

- `jetbrains`
- `geist-mono`
- `sf-mono`
- `fira-code`
- `system-mono`

Tokens reference these font family names in:

- `packages/shared/src/design/tokens.css`

But `apps/web/public/fonts` currently only contains:

- `Geist-Variable.woff2`

There is no clear `@font-face` setup in `apps/web/src/styles/globals.css` for the exposed presets. As a result, selecting some fonts can silently fall back to system fonts.

### Proposed Fix

Choose one of these strategies:

1. Bundle the font assets for every exposed preset and add `@font-face` declarations.
2. Remove or disable presets that are not actually available.
3. Rename presets to make it clear which are system-dependent.

Recommended first pass:

- Load bundled Geist correctly.
- Keep `system` as a true system fallback.
- Either bundle or remove `satoshi`, `jetbrains`, and `fira-code`.
- Make `sf-mono` and `system-mono` explicit system-code presets.

### Fix Reasoning

Appearance settings should produce predictable results. If a user selects a font and the app silently falls back, the setting feels broken and screenshots become inconsistent across machines.

### Verification To Run After Fix

Run the common verification set.

Check font assets and declarations:

```bash
find apps/web/public/fonts -type f -maxdepth 2
rg -n "@font-face|data-ui-font|data-code-font|font-ui|font-code" apps/web/src packages/shared/src/design
```

Browser verify:

- Switch every UI font option in settings.
- Switch every code font option in settings.
- Confirm computed font family changes for normal text.
- Confirm computed font family changes for code/shortcut text.
- Refresh and confirm the selected fonts persist.

## 6. Raw Theme-Bypassing Colors Remain

### Issue

Several web components still use raw Tailwind palette colors instead of semantic theme tokens.

### Details

Examples found:

- `bg-red-500` and `bg-green-500` in `apps/web/src/components/patterns/streak.tsx`
- Emerald scales in `apps/web/src/components/patterns/activity-chart.tsx`
- Red/yellow/green/emerald illustrative colors in onboarding components
- `bg-gray-200` and `text-red-600` in `apps/web/src/components/domain/projects/project-tabs.tsx`

Some illustrative or branded colors may be acceptable, but product UI should use semantic tones such as:

- `--tone-danger`
- `--tone-status-done`
- `--tone-status-progress`
- `--tone-status-todo`
- `--tone-task`
- `--tone-note`
- `--tone-project`

### Proposed Fix

Replace raw product UI colors with semantic tokens.

Examples:

- Streak active dot: `bg-[var(--tone-status-done)]`
- Streak inactive dot: `bg-[var(--tone-danger)]` or a muted token, depending on desired meaning
- Activity chart: introduce semantic activity intensity tokens such as `--tone-activity-1` through `--tone-activity-4`
- Destructive project actions: `text-[var(--tone-danger)]`

For onboarding illustrations, decide whether they are:

- Product UI, which should use semantic tokens.
- Decorative illustration, which may use documented palette exceptions.

### Fix Reasoning

Raw palette colors do not respond to custom themes. A user changing appearance settings should not end up with random default Tailwind red/green/emerald islands unless those colors are intentionally semantic and theme-aware.

### Verification To Run After Fix

Run the common verification set.

Run a raw color scan:

```bash
rg -n "\\b(bg|text|border|ring|from|to|via)-(red|green|emerald|yellow|gray|slate|zinc|neutral|stone|blue|purple|pink|rose|amber|cyan)-" apps/web/src/components
```

Expected result:

- No raw palette colors in product UI.
- Any remaining raw colors are documented illustration or brand exceptions.

Browser verify:

- Streak indicator.
- Activity chart.
- Onboarding screens.
- Destructive project/menu actions.
- Dark and light themes.
- At least one custom appearance template.

## 7. Silent Tailwind No-Op Utilities In Onboarding

### Issue

Some classes look like Tailwind utilities but do not generate CSS.

### Details

Confirmed suspicious examples:

- `bg-emerald-500/8`
- `bg-foreground/8`
- `h-18`
- `w-18`

These occur in onboarding components. Tailwind's default spacing scale does not include `18`, and opacity values like `/8` are not guaranteed unless generated as arbitrary opacity values.

### Proposed Fix

Replace invalid or suspicious utilities with valid utilities:

- `h-18 w-18` -> `size-[4.5rem]`
- `bg-emerald-500/8` -> `bg-emerald-500/[0.08]`, or preferably a semantic token
- `bg-foreground/8` -> `bg-foreground/[0.08]`, or preferably a semantic token

Better: replace decorative onboarding visuals with named pattern primitives or CSS variables.

### Fix Reasoning

This is another silent failure mode: the code reads as if it applies styling, but the generated CSS may not contain the rule. These are hard to notice without visual inspection.

### Verification To Run After Fix

Run the common verification set and:

```bash
corepack pnpm --filter @mindtab/web e2e
```

Run targeted searches:

```bash
rg -n "\\b(h|w|size)-18\\b|/(8)\\b" apps/web/src/components/patterns/onboarding
```

Expected result:

- No default-scale `h-18` or `w-18`.
- No ambiguous `/8` opacity modifiers.

Browser verify onboarding, especially:

- Completion/success screen sizing.
- Glow/background decorative elements.
- Chrome extension step visual mockup.

## 8. Dead `ProjectTabs` Component Still Exists

### Issue

The old top project navigation component still exists even though project navigation moved to the sidebar.

### Details

Current file:

- `apps/web/src/components/domain/projects/project-tabs.tsx`

Legacy compatibility wrappers also reference it:

- `apps/web/src/components/projects/project-tabs.tsx`
- `apps/web/src/components/projects/index.tsx`

The component still contains old behavior and raw styling, including global "All Tasks" style navigation that conflicts with the sidebar-first workstation model.

### Proposed Fix

If no current route or component uses `ProjectTabs`, delete:

- `apps/web/src/components/domain/projects/project-tabs.tsx`
- wrapper exports that expose it

If some code still needs project actions, extract only the needed create/edit/archive/delete pieces into current sidebar or project-management primitives.

### Fix Reasoning

Dead UI components are dangerous in an agent-heavy workflow. Future agents may reuse old components because they appear canonical, reintroducing removed UX decisions and old raw styling.

### Verification To Run After Fix

Run:

```bash
rg -n "ProjectTabs|project-tabs" apps/web/src
corepack pnpm --filter @mindtab/web lint
corepack pnpm --filter @mindtab/web build
```

Expected result:

- No `ProjectTabs` references remain unless explicitly retained.

Browser verify:

- Sidebar project navigation still works.
- Project create/edit flows still work if they are still exposed elsewhere.
- No top project pill navigation returns.

## 9. Unused `text-editor.css` Duplicates Rich Text Styling

### Issue

`text-editor.css` defines rich-text/editor styles, but it appears unused. Similar styling exists in `globals.css`.

### Details

Current files:

- `apps/web/src/styles/text-editor.css`
- `apps/web/src/styles/globals.css`

`main.tsx` imports `globals.css`, but no import for `text-editor.css` was found.

Both files define TipTap/prose concepts such as:

- heading styles
- list styles
- code/pre styles
- blockquote styles
- rule styles

This creates a drift source: future agents may edit the unused file, or import it later and unexpectedly change editor rendering.

### Proposed Fix

Delete `text-editor.css` if it is truly unused.

Then consolidate rich-text styling into one deliberate location:

- `components/patterns/rich-text` for component structure, and
- `globals.css` or a single imported rich-text stylesheet for global prose/editor CSS.

If a separate stylesheet is preferred, import it explicitly from `main.tsx` and remove duplicate rules from `globals.css`.

### Fix Reasoning

Rich text is a high-risk visual area. Editor, preview, note prose, and task description prose should share one styling source so they do not diverge.

### Verification To Run After Fix

Run the common verification set and:

```bash
rg -n "text-editor.css|TipTap editor styles|Basic editor styles|ProseMirror\\.tiptap" apps/web/src
corepack pnpm --filter @mindtab/web e2e
```

Browser verify:

- Note editor.
- Note preview cards.
- Note dialog read mode.
- Task description editor.
- Task description preview.
- Onboarding notes intro rich-text editor.

## 10. Stale Habits Asset Remains

### Issue

A stale habits image remains in the web public assets.

### Details

Current file:

- `apps/web/public/mindtab-habits.png`

The product direction removed habits and XP from web. The asset was not found in current source references, but it remains available for accidental reuse.

### Proposed Fix

Delete `apps/web/public/mindtab-habits.png` if it is not used by mobile, backend, docs, or external deployment assumptions.

If the asset is retained for historical reasons, move it out of the web public runtime path and document why.

### Fix Reasoning

Public assets are part of the app surface. Stale assets increase confusion and can cause future agents to reintroduce retired product concepts.

### Verification To Run After Fix

Run:

```bash
rg -n "mindtab-habits|habit|Habits|XP|xp" apps/web
corepack pnpm --filter @mindtab/web build
```

Expected result:

- No habits/XP references in web runtime code or public assets.

Browser verification is usually not required unless an asset manifest or onboarding image changes.

## Guardrail Improvements

The current audit scripts are useful but not strict enough to catch these classes of bugs.

### Add Undefined Tailwind Semantic Key Detection

Create or extend an audit script that checks semantic-looking Tailwind color utilities against `tailwind.config.ts`.

It should catch examples like:

- `bg-sidebar`
- `text-sidebar-foreground`
- `hover:bg-sidebar-accent`

### Add Non-Generated Utility Detection

Add a check for known-invalid default-scale utilities, especially:

- `h-18`
- `w-18`
- `size-18`
- ambiguous non-default opacity modifiers like `/8`

Use arbitrary values intentionally:

- `size-[4.5rem]`
- `bg-foreground/[0.08]`

### Tighten Approved-Layer Audits Over Time

The current UI audits allow raw Tailwind inside:

- `components/ui`
- `components/layout`
- `components/patterns`
- `components/domain`
- `styles`

That was useful for migration, but it means many raw typography/color decisions inside `domain` and `patterns` can still drift.

Recommended next step:

- Keep `ui`, `layout`, and documented pattern primitives permissive.
- Make `domain` and large `patterns` files warning-only but visible in reports.
- Require documented exceptions for raw palette colors and arbitrary typography.

### Recommended Verification Baseline

After any meaningful UI architecture cleanup, run:

```bash
corepack pnpm --filter @mindtab/web lint
corepack pnpm --filter @mindtab/web audit:ui
corepack pnpm --filter @mindtab/web audit:typography
corepack pnpm --filter @mindtab/web build
corepack pnpm --filter @mindtab/web e2e
```

