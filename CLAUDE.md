# CLAUDE.md

## Project Overview

Huobao Drama — AI-powered drama/video production tool. Full TypeScript stack.

## Structure

```
backend/   — Hono + Drizzle ORM + Mastra (AI agents) + mysql2
frontend/  — Nuxt 3 + Vue 3 + TypeScript (pure CSS, no UI framework)
configs/   — config.yaml
data/      — generated static files
skills/    — Agent SKILL.md definitions
```

## Commands

### Backend (`backend/`)
- `npm run dev` — Start dev server with tsx watch (port 5679)
- `npm start` — Start production server
- `npm run typecheck` — TypeScript type checking

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server (port 3013, proxies /api to 5679)
- `npm run build` — Production build

## Architecture

### Backend
- **HTTP**: Hono framework with CORS, logger middleware
- **Database**: Drizzle ORM + mysql2, schema in `src/db/schema.ts`
- **AI Agents**: Mastra framework with AI SDK (OpenAI compatible providers)
- **Agent Types**: script_rewriter, extractor, storyboard_breaker, grid_prompt_generator
- **Agent Chat**: Hono JSON endpoints for agent responses
- **File Storage**: Local filesystem under `data/static/`

### Frontend
- **Vue 3** + TypeScript + Vite
- **Routing**: Vue Router (4 routes: list, detail, workbench, settings)
- **State**: Single composable `useWorkbench.ts` for workbench page
- **API**: Unified fetch client in `src/api/index.ts` with SSE async generator
- **Styling**: Pure CSS with CSS variables (dark theme)

## Database
MySQL is the only runtime database. The backend reads `DATABASE_URL` first, then falls back to `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`.
Tables are created on startup from `src/db/mysql-schema.ts`.

## Key Config
- `configs/config.yaml` — AI provider defaults
- AI service configs stored in DB (`ai_service_configs` table)
- Agent configs stored in DB (`agent_configs` table)
