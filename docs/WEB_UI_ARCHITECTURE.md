# Web UI Architecture

MindTab web should be built from named UI layers, not from page-level Tailwind.

The goal is simple: product pages describe structure, data, and behavior. Visual decisions live in primitives, layout components, product patterns, and domain components. This keeps the app coherent while many agents and people are editing it.

## Layers

### `apps/web/src/components/ui`

Atomic primitives and shadcn/Radix wrappers.

Use this layer for buttons, inputs, dialogs, selects, tooltips, typography, badges, tables, and other small reusable controls. Tailwind is allowed here because this is one of the places where visual policy is defined.

### `apps/web/src/components/ai-elements`

Owned shadcn registry components for AI-native interaction.

Use this layer for conversation scrolling, streaming markdown, prompt input, tool-step disclosure, code blocks, and other reusable AI response primitives. These files come from the AI Elements registry and may be adapted to MindTab's aliases, button sizes, tokens, and accessibility rules. Product-specific chat behavior and styling still belongs in `components/domain/chat`; route and page files should not style these primitives directly.

### `apps/web/src/components/layout`

Reusable composition primitives.

Use this layer for page containers, panels, surfaces, stacks, inline layouts, grids, scroll containers, panel headers, bodies, and footers. Layout primitives encode spacing, max-widths, borders, radii, scrolling behavior, and common surface treatment.

### `apps/web/src/components/patterns`

Reusable product patterns that are not domain-specific.

Use this layer for empty states, loading states, error states, segmented controls, filter tabs, metadata chips, entity chips, detail tiles, stat cells, action rails, and similar repeated UI patterns.

### `apps/web/src/components/patterns/settings`

Settings-specific product patterns.

Settings rows, panels, theme cards, color controls, range controls, settings nav items, and settings shells belong here. They are too specific for `components/ui`, but should still be shared instead of hand-authored in the settings page.

### `apps/web/src/components/domain`

Feature-owned domain components.

Domain components may contain Tailwind internally, but pages and orchestration components should consume them. Examples include `TaskCard`, `CalendarEventChip`, `VaultItemCard`, `ChatMessageBubble`, and sidebar navigation items.

### `apps/web/src/styles`

Global CSS and editor/prose styling.

Use this layer for app-wide CSS, token application, rich text/editor CSS, and style resets. Avoid feature-specific styling here.

Rich text UI should be composed through `components/patterns/rich-text` exports such as `RichTextEditor`, `RichTextEditorSurface`, and `Prose`. Domain components may wrap those patterns for domain-specific names such as `RichTextPreview` or `NoteProseSurface`.

## Tailwind Rules

Tailwind is allowed in:

- `components/ui`
- `components/ai-elements`
- `components/layout`
- `components/patterns`
- `components/domain`
- `styles`

Tailwind should be avoided in:

- `routes`
- page components
- feature orchestration components
- data/query/business logic components

Route, page, and shell files should avoid `className` entirely. If one of those files needs spacing, scrolling, app chrome, or a loading frame, add or reuse a layout or pattern component instead.

Legacy paths may temporarily re-export approved-layer implementations during migration. Those compatibility wrappers should stay thin and should not contain Tailwind or local visual markup.

When a page needs visual styling, first ask which reusable layer should own it. If the answer is “this appears in more than one place” or “future agents will probably need this again,” create or extend a primitive, pattern, or domain component.

## Typography

Use:

- `Text` for body, muted, subtle, and danger text
- `Heading` for page, section, and panel headings
- `MetaText` for metadata, labels, timestamps, counts, and helper text
- `CodeText` for true code, IDs, task keys, shortcuts, and machine-readable values

Avoid raw typography utilities such as `text-sm`, `text-[13px]`, `font-semibold`, `leading-*`, and `tracking-*` in feature files.

Font families must route through:

- `--font-ui`
- `--font-code`

Do not hard-code font families in feature components.

## Semantic Color

Meaningful colors should come from semantic tokens and helpers.

Use semantic tone tokens for:

- priorities: `--tone-priority-*`
- impact: `--tone-impact-*`
- statuses: `--tone-status-*`
- destructive actions: `--tone-danger`
- tasks and task mentions: `--tone-task`
- notes: `--tone-note`
- projects: `--tone-project`

Do not flatten task priority, impact, status, danger, note, or project colors into one generic text color.

Avoid direct feature-level palette usage like:

- `text-[var(--green)]`
- `text-[var(--amber)]`
- `text-[var(--cyan)]`
- `text-[var(--rose)]`

If a direct palette color is necessary, keep it inside an approved primitive, pattern, domain component, or theme engine file and document why.

## Surfaces And State

Use layout and pattern components for repeated surfaces:

- `Surface`
- `Panel`
- `SettingsCard`
- `TaskCard`
- `VaultItemCard`
- `NoteCard`

Hover, selected, disabled, focus, overlay, and elevation styles should be centralized in reusable components where possible.

## Page Code Expectations

Good page code:

```tsx
<Page>
  <PageHeader>
    <Heading variant="page">Vault</Heading>
    <VaultFilterTabs value={filter} options={options} onValueChange={setFilter} />
  </PageHeader>
  <PageBody>
    <VaultItemCard title={save.title} summary={save.summary} sourceType={save.type} />
  </PageBody>
</Page>
```

Avoid page code like:

```tsx
<div className="mx-auto max-w-6xl px-8 py-10">
  <h1 className="text-2xl font-semibold tracking-tight text-white">Vault</h1>
  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-xl">
    ...
  </div>
</div>
```

## Adding Components

Add a primitive when the component is domain-neutral and small.

Add a layout component when it controls page, panel, surface, grid, stack, or scroll composition.

Add a pattern when it represents a reusable product UI pattern but not a specific domain object.

Add a domain component when it represents a task, note, calendar event, chat, vault item, sidebar item, or other business entity.

## Guardrails

Run these before finishing web UI work:

```bash
pnpm --filter @mindtab/web audit:typography
pnpm --filter @mindtab/web audit:ui
```

Both audits are warning-only for now. New raw `className` or raw Tailwind findings in routes, pages, and feature orchestration files should be treated as design-system debt unless deliberately documented.

## Agent Checklist

Before adding UI:

- Check whether a primitive, layout component, pattern, or domain component already exists.
- Prefer `Text`, `Heading`, `MetaText`, and `CodeText` over raw typography classes.
- Prefer semantic tone badges and helpers over direct palette classes.
- Keep Tailwind in approved layers.
- If a feature file needs repeated classes, move the pattern down into an approved component.
- Preserve behavior and visual intent unless the user explicitly asks for redesign.
