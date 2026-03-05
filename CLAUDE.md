# MindTab

Cross-platform monorepo for goal tracking and micro journaling. Available at [mindtab.in](https://mindtab.in).

## Tech Stack

| Layer       | Stack                                                  |
|-------------|--------------------------------------------------------|
| Web         | Vite + React 18 + TanStack (Query + Router) + Tailwind + shadcn/ui |
| Backend     | Go + Chi + sqlc + PostgreSQL                           |
| Mobile      | Expo React Native (Phase 2)                            |
| Landing     | Astro (Phase 3)                                        |
| Extension   | Chrome MV3                                             |
| Monorepo    | pnpm workspaces                                        |

## Project Structure

```
mindtab-v2/
├── apps/
│   ├── web/              # Vite + React SPA (app.mindtab.in)
│   ├── extension/        # Chrome MV3 extension
│   ├── mobile/           # Expo React Native (Phase 2)
│   └── landing/          # Astro landing site (Phase 3)
├── packages/
│   ├── api-spec/         # OpenAPI spec & generated TypeScript types
│   ├── shared/           # Shared utilities and constants
│   └── core/             # Core business logic
├── server/               # Go API server (api.mindtab.in)
│   ├── cmd/api/          # Server entrypoint
│   ├── internal/         # Application code (handlers, middleware, db)
│   ├── migrations/       # SQL migration files
│   └── sqlc.yaml         # sqlc configuration
└── package.json          # Root workspace config
```

## Commands

### Root

```bash
pnpm dev            # Start web dev server
pnpm build          # Build api-spec, shared, and web
pnpm clean          # Clean all workspace packages
```

### Web

```bash
cd apps/web && pnpm dev       # Start Vite dev server
cd apps/web && pnpm build     # Production build
```

### Server

```bash
cd server && go run ./cmd/api     # Run API server
cd server && go build ./cmd/api   # Build API binary
```

### API Types

```bash
cd packages/api-spec && pnpm build    # Generate TypeScript types from OpenAPI spec
```

### Database

```bash
cd server && sqlc generate                                      # Generate type-safe Go DB code
migrate -path migrations -database $DATABASE_URL up             # Run migrations up
migrate -path migrations -database $DATABASE_URL down           # Roll back migrations
```

## Key Conventions

- Dark mode forced by default
- All data is user-scoped (userId extracted from JWT)
- Soft deletion pattern (deleted_at timestamps)
- OpenAPI spec is the source of truth for API types
- sqlc for type-safe Go database queries
- Path alias: `~/` maps to `src/` in the web app
- Database tables prefixed with `mindmap_`

## Domains

| Domain            | Service     |
|-------------------|-------------|
| app.mindtab.in    | Web app     |
| api.mindtab.in    | Go API      |
| www.mindtab.in    | Landing page|

## Auth Flow

Google OAuth -> JWT

- Access token: 15-minute expiry
- Refresh token: 30-day httpOnly cookie
- Flow: Google OAuth callback -> server issues JWT pair -> client stores access token in memory, refresh token as cookie
