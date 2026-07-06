# AI Home Designer — Build Progress

> Last updated: 2026-07-06

## Legend
- ✅ Done
- 🔄 In progress / partial
- ⬜ Not started

---

## Phase 1 — Monorepo Scaffold

| Task | Status |
|------|--------|
| Root `package.json` (pnpm workspace) | ✅ |
| `pnpm-workspace.yaml` | ✅ |
| `turbo.json` | ✅ |
| `tsconfig.base.json` | ✅ |
| `.gitignore` | ✅ |
| `.nvmrc` (Node 20) | ✅ |

---

## Phase 2 — Shared Packages

| Task | Status |
|------|--------|
| `packages/types` — user, project, house, ai, rules types | ✅ |
| `packages/database` — Prisma schema, PrismaClient singleton | ✅ |
| `packages/ai-gateway` — AIAdapter interface, ClaudeAdapter, OpenAIAdapter, AIGateway | ✅ |

---

## Phase 3 — API (NestJS)

| Module | Files | Status |
|--------|-------|--------|
| `main.ts` + `app.module.ts` | Bootstrap, global prefix, Swagger, throttler | ✅ |
| **Auth** | auth.module, auth.service, auth.controller, register/login DTOs, JWT strategy | ✅ |
| **Users** | users.module, users.service, users.controller | ✅ |
| **Projects** | projects.module, projects.service, projects.controller (plot/lifestyle/budget) | ✅ |
| **AI** | ai.module, ai.service, ai.controller, system.prompt.ts | ✅ |
| **Houses** | houses.module, houses.service, houses.controller | ✅ |
| **Rules** | rules.module, rules.service (Romanian validators), rules.controller | ✅ |
| **Costs** | costs.module, costs.service (Romanian rate table), costs.controller | ✅ |
| **Exports** | exports.module, exports.service (JSON summary + DXF placeholder), exports.controller | ✅ |
| `.env.example` | All env vars documented | ✅ |

---

## Phase 4 — Frontend (Next.js 14)

| Task | Status |
|------|--------|
| `package.json`, `next.config.ts`, `tsconfig.json` | ✅ |
| `tailwind.config.ts`, `postcss.config.js` | ✅ |
| `.env.example` | ✅ |
| Root layout + globals.css | ✅ |
| `providers.tsx` (ReactQuery) | ✅ |
| Landing page (`/`) | ✅ |
| Auth layout + Login page + Register page | ✅ |
| `LoginForm` + `RegisterForm` components | ✅ |
| Dashboard layout (Sidebar + TopBar) | ✅ |
| Projects list page + `ProjectsGrid` component | ✅ |
| Project detail page + `ProjectDetail` component | ✅ |
| Editor page + `EditorLayout` | ✅ |
| `FloorPlanCanvas` (Konva 2D) | ✅ |
| `EditorToolbar` | ✅ |
| `RoomPanel` (properties sidebar) | ✅ |
| `AiChat` component | ✅ |
| `api.ts` (Axios client + JWT interceptors) | ✅ |
| `auth.store.ts` (Zustand) | ✅ |
| `project.store.ts` (Zustand) | ✅ |
| `useProjects.ts` hooks | ✅ |

---

## Phase 5 — Infrastructure & DevOps

| Task | Status |
|------|--------|
| `fly.toml` for API deployment | ⬜ |
| `Dockerfile` for API | ⬜ |
| GitHub Actions CI/CD pipeline | ⬜ |
| Neon DB connection + migrations | ⬜ |
| Cloudflare R2 storage integration | ⬜ |

---

## Phase 6 — Features (Next iterations)

| Feature | Status |
|---------|--------|
| 3D viewer (Three.js) | ⬜ |
| Energy optimizer module | ⬜ |
| Architect Workspace (professional tools) | ⬜ |
| Permit document generator (DTAC/PTh) | ⬜ |
| AEC Marketplace (manufacturer products) | ⬜ |
| Multi-language support (HU, EN, DE, FR) | ⬜ |
| Subscription/billing (Stripe) | ⬜ |
| HomeOS / Digital Twin | ⬜ |
| Construction Manager module | ⬜ |
| BIM integration | ⬜ |

---

## Next immediate steps
1. `pnpm install` — install all dependencies
2. Set up `.env` files with real keys
3. `pnpm db:push` — create DB tables in Neon
4. `pnpm dev` — start both API and web
5. Test auth flow end-to-end
6. Wire AI chat to update the floor plan canvas when design_update is returned
7. Add `fly.toml` + `Dockerfile` for API deployment
