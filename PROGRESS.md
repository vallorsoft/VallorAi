# AI Home Designer — Build Progress

> Last updated: 2026-07-06 (post-launch)

## Live status
- **API**: https://vallorai-api.fly.dev/api/v1 — deployed, stable
- **Web**: https://vallorai.fly.dev — deployed, stable
- **DB**: Neon PostgreSQL, 13 tables pushed; `db-push` job runs automatically on every deploy
- **Auth**: register + login confirmed working end-to-end on the live site
- **AI provider**: Gemini (default), Claude and OpenAI adapters also wired in
- Nothing beyond signup/login has been exercised live yet — projects, editor, AI chat, costs, exports all exist in code but are unverified in production.

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
| `fly.toml` for API + web deployment | ✅ |
| `Dockerfile.api` + `Dockerfile.web` | ✅ |
| GitHub Actions CI/CD pipeline (db-push → deploy-api → deploy-web) | ✅ |
| Neon DB connection + `prisma db push` (13 tables live) | ✅ |
| Workspace packages compiled to JS for runtime (fixed API crash-loop) | ✅ |
| Cloudflare R2 storage integration | ⬜ |

---

## Phase 5.5 — Email (Brevo) — IN PROGRESS

Registration currently issues JWT tokens immediately with no email step at all.
Target: full email verification before first login, using Brevo as the transactional
email provider. **Emails go out using Brevo's own default/system sender template
for now** — no custom HTML design yet. Swapping in a branded Romanian-language
template is a separate, later task once the product has real users.

| Task | Status |
|------|--------|
| Add `verificationToken` + `verificationTokenExpiresAt` to `User` model | ⬜ |
| `MailModule`/`MailService` — thin wrapper over Brevo's transactional email REST API (`api.brevo.com/v3/smtp/email`), no new SDK dependency (uses native `fetch`) | ⬜ |
| `register()`: create user as unverified, generate token, send verification email, do **not** issue JWT yet — return a "check your email" response instead | ⬜ |
| `login()`: reject with a clear error if `isVerified` is false | ⬜ |
| `POST /auth/verify-email` — validates token + expiry, sets `isVerified = true`, issues JWT tokens | ⬜ |
| `POST /auth/resend-verification` — regenerates token, resends email (covers expired/lost emails) | ⬜ |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` — Fly.io secrets + `.env.example` | ⬜ |
| Web: `/verify-email?token=...` page that calls the endpoint and logs the user in on success | ⬜ |

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
1. **Email verification via Brevo** (Phase 5.5 above) — blocks trusting who's actually registering
2. Manually exercise every live feature end-to-end (projects CRUD, editor canvas, AI chat, cost estimate, exports) and fix whatever breaks — none of it has been tested against the real deployed DB yet
3. Cloudflare R2 for file/photo storage (Plot photos, exported documents)
4. Wire AI chat to update the floor plan canvas when a `design_update` payload comes back
5. Revisit Phase 6 feature list with the client and prioritize
