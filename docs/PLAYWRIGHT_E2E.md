# Playwright E2E

MindTab web uses Playwright for browser-level checks and visual inspection.

## Setup

Install dependencies with the repo-pinned pnpm:

```bash
corepack pnpm install
corepack pnpm e2e:web:install
```

`e2e:install` installs Chromium for Playwright. Add other browsers only when a test explicitly needs them.

## Running Tests

From the repo root:

```bash
corepack pnpm e2e:web
corepack pnpm e2e:web:headed
corepack pnpm e2e:web:ui
```

The Playwright config starts Vite on `127.0.0.1:5173` and reuses an existing dev server when one is already running. Override the base URL with:

```bash
MINDTAB_E2E_BASE_URL=http://localhost:5173 corepack pnpm e2e:web
```

The local API server should run on port `8081` and the web dev server should run on `5173`. Dockerized local dev should use the same ports:

```bash
docker compose up -d
```

The web Vite proxy and e2e tests default to:

```bash
API_URL=http://localhost:8081
VITE_API_URL=http://localhost:8081
MINDTAB_E2E_API_URL=http://localhost:8081
```

## Authenticated Visual Checks

Authenticated workstation screenshots use the backend email credential flow. The test seeds verified disposable accounts into the configured database, signs in through `/auth/email/signin`, and then verifies dashboard, settings, chat, vault, sidebar account menu, task dialog, notes, calendar, and onboarding surfaces.

Required local env values:

```bash
MINDTAB_E2E_DATABASE_URL=postgres://user:pass@localhost:5432/mindtab?sslmode=disable
MINDTAB_E2E_API_URL=http://localhost:8081
MINDTAB_E2E_EMAIL=mindtab-e2e-web@mindtab.local
MINDTAB_E2E_PASSWORD='MindTabE2E!2026'
MINDTAB_E2E_NAME='MindTab E2E'
MINDTAB_E2E_ONBOARDING_EMAIL=mindtab-e2e-onboarding@mindtab.local
MINDTAB_E2E_ONBOARDING_NAME='MindTab Onboarding'
```

`MINDTAB_E2E_DATABASE_URL` can be omitted when `DATABASE_URL` is already available from `server/.env` or the shell. Keep e2e credentials local/dev scoped; do not use a personal production account for visual tests.

To create or update visual snapshots:

```bash
corepack pnpm --filter @mindtab/web e2e:update
```

## Agent Expectations

- Use Playwright when changing layout, navigation, dialogs, settings, dashboard surfaces, chat, vault, calendar, or visual theme behavior.
- Prefer `e2e:ui` or `e2e:headed` for visual debugging.
- Keep tests deterministic. Prefer the seeded email credential account over live third-party auth popups or personal user data.
- Do not commit `test-results/`, `playwright-report/`, videos, traces, or local storage state files.
