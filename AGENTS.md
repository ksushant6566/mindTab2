# MindTab Agent Guide

MindTab is a pnpm monorepo for the web app, mobile app, Chrome extension, landing site, shared packages, and Go API.

## First Principles

- Preserve user work. Do not revert unrelated changes in this working tree.
- Prefer repo patterns over new abstractions. Add a primitive or shared component only when it removes real repetition or makes future work safer.
- Keep API contracts source-of-truth driven: OpenAPI for web API types, sqlc for Go database code, migrations for schema changes.
- Use `corepack pnpm` when installing or changing dependencies; the repo pins pnpm 9.1.0.
- After web UI changes, run the web static checks and use Playwright when visual behavior matters.
- Local Docker dev uses API port `8081` and web port `5173`.

## Key Locations

- Web app: `apps/web`
- Web UI architecture guide: `docs/WEB_UI_ARCHITECTURE.md`
- Playwright guide: `docs/PLAYWRIGHT_E2E.md`
- Shared design tokens: `packages/shared/src/design/tokens.css`
- API spec: `packages/api-spec`
- Go API: `server`
- SQL migrations: `server/migrations`

## Web UI Rules

Use `docs/WEB_UI_ARCHITECTURE.md` before adding or changing web UI.

- Tailwind belongs in `components/ui`, `components/layout`, `components/patterns`, `components/domain`, and `styles`.
- Routes, pages, shells, and feature orchestration files should compose existing primitives and domain components instead of writing raw `className`.
- Use `Text`, `Heading`, `MetaText`, and `CodeText` for typography.
- Use semantic tones for priority, impact, status, danger, notes, projects, tasks, and appearance. Preserve meaningful color distinctions.
- Before finishing web UI work, run:

```bash
corepack pnpm --filter @mindtab/web lint
corepack pnpm --filter @mindtab/web audit:typography
corepack pnpm --filter @mindtab/web audit:ui
```

## Playwright

Use Playwright for visual inspection and browser-level regression checks. See `docs/PLAYWRIGHT_E2E.md`.

Local dev and e2e should run against the same ports:

```bash
docker compose up -d
```

The API should be reachable at `http://localhost:8081`; the web app should be reachable at `http://localhost:5173`.

Common commands:

```bash
corepack pnpm e2e:web
corepack pnpm e2e:web:headed
corepack pnpm e2e:web:ui
```

For authenticated workstation checks, run against the local API on port `8081`:

```bash
MINDTAB_E2E_API_URL=http://localhost:8081 corepack pnpm e2e:web
```

Authenticated visual tests use a seeded email credential account; see `docs/PLAYWRIGHT_E2E.md` for the required `MINDTAB_E2E_*` variables.

## Verification Defaults

- Web: `corepack pnpm --filter @mindtab/web lint` and `corepack pnpm --filter @mindtab/web build`.
- Shared/core type changes: run the matching package `lint`.
- Backend changes: run relevant Go tests and regenerate sqlc/OpenAPI outputs when contracts change.
- Dependency changes: use `corepack pnpm install --no-frozen-lockfile`, then verify the lockfile diff is intentional and minimal.
