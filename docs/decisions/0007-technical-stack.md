# ADR-0007: Provisional TypeScript full-stack tooling

- **Status:** Proposed, pending Phase 1 platform proof
- **Date:** 2026-11-17

## Proposal

Node.js **24 as the primary target**, supporting Node **22.16+ and 26**, strict TypeScript, React, TanStack Start 1.x, TanStack Router/Query when useful, SQLite, Drizzle, `better-sqlite3`, Zod, Tailwind, accessible shadcn primitives, pnpm, Vitest and Playwright.

## Alternative

React/Router plus Hono/Fastify exposes explicit separate HTTP contracts but adds adapters/configuration without clear need for this small local app. No separate backend framework initially.

## Constraints

Server functions are independently callable endpoints; enforce auth/permissions/CSRF at each boundary. A real production build/start, native driver install, migrations, bundling and cross-OS testing must pass before promoting this ADR to accepted.

## Runtime amendment (2026-11-17)

User explicitly selected Node 24 as primary with 22 and 26 compatibility. This runtime target is **CONFIRMED**. External TanStack/Drizzle driver validation remains pending. The current backend uses `node:sqlite` in identity, accounting, business services and infrastructure. This is a real current implementation choice, not Drizzle integration or a verified long-term driver decision. Vite 8 supports the Node 22.16 minimum per its official requirements.
