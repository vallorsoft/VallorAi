# AI Home Designer — Build Progress

> Last updated: 2026-07-07 (BIM-detail feature, steps 0-4 done)

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
| GitHub Actions CI/CD pipeline (db-migrate → deploy-api → deploy-web) | ✅ |
| Neon DB connection + `prisma db push` (13 tables live) | ✅ |
| Workspace packages compiled to JS for runtime (fixed API crash-loop) | ✅ |
| Cloudflare R2 storage integration | ⬜ |

---

## Spec audit & roadmap (2026-07-07)

13 PDF specs uploaded to `docs/materials/` were processed and cross-checked against
the codebase (see `Master p.PDF`/`Master 2.PDF` note below). A phased roadmap was
produced reconciling the specs' vision with what's actually built; full detail lives
in the session's plan, condensed here as Phase 0/1 below. Two files
(`Master p.PDF`, `Master 2.PDF`) contain AI-agent prompt-injection style text, not
genuine specs — their literal instructions are not followed; their product content
(manufacturer schema etc.) is noted only as background for a future marketplace phase.

### Phase 0 — Baseline hygiene — DONE

| Task | Status |
|------|--------|
| Real Prisma migrations (`packages/database/prisma/migrations/`, baselined as `20260707052955_init`) | ✅ |
| Jest unit test harness for `apps/api` (`RulesService` coverage) | ✅ |
| Jest e2e smoke test harness for `apps/api` (auth guard + register flow) | ✅ |
| CI: `db-push` job replaced with `db-migrate` (`prisma migrate deploy`) | ✅ (code) — **manual one-time step still required**, see below |

**Action required before the next deploy runs**: production's Neon DB already has the
`init` schema plus the email-verification columns (both applied via the old `db push`
step — the latter from #22/#23). Prisma has no migration history for either yet. Before
`db-migrate` runs for real, resolve these two (via the "Baseline Prisma Migrations"
manual workflow, or by hand with the production `DATABASE_URL`):
```
pnpm --filter @ai-home-designer/database exec prisma migrate resolve --applied 20260707052955_init
pnpm --filter @ai-home-designer/database exec prisma migrate resolve --applied 20260707055000_add_email_verification
```
Do **not** resolve `20260707060241_add_project_versioning_and_password_reset` — those
tables are genuinely new and must be created for real by `migrate deploy`. Skipping the
two resolves above makes the first `migrate deploy` fail (it will try to re-create
tables/columns that already exist). This was deliberately not run by the agent — it
touches the live production database and needs a human with real prod credentials (or
the manual GitHub Actions workflow, which uses the existing `DATABASE_URL` secret).

### Phase 1 — Foundation correctness — MOSTLY DONE

| Task | Status |
|------|--------|
| Response envelope `{success,data,meta}` (interceptor + exception filter, `@SkipEnvelope()` for the AI SSE stream) | ✅ |
| Auth hardening: `POST /auth/forgot-password`, `POST /auth/reset-password` (`PasswordResetToken` model; email send is a logged stub pending Phase 5.5 Brevo) | ✅ |
| Project versioning: `ProjectVersion` snapshot on every House mutation, `GET /projects/:id/versions`, `POST /projects/:id/versions/:id/restore` (transactional, non-destructive) | ✅ |
| AI system prompt language fix (`getSystemPrompt` now honors `ro`/`en`/`hu`, was previously hardcoded to Romanian) | ✅ |
| AI JSON response validation (zod schema + code-fence stripping, stored in `Message.metadata`, degrades gracefully) | ✅ |
| `ProjectRole`/`ProjectPermission` for per-project sharing | ⬜ **pending product-owner sign-off** — is project sharing wanted yet? |

Known gap noted during implementation, not yet fixed: `houses.controller.ts` endpoints
(room/wall mutations) still have no project-ownership check at the `houseId`/`roomId`
level — only the new `/projects/:id/versions*` endpoints inherit an ownership check
(via `ProjectsService`). Worth closing before/alongside `ProjectPermission`.

See session plan for full detail and the items needing
explicit business sign-off before starting.

---

## Phase 5.5 — Email (Brevo) — DONE (merged via #22/#23, in parallel with the spec-audit work above)

Full email verification before first login, using Brevo as the transactional
email provider. **Emails go out using Brevo's own default/system sender template
for now** — no custom HTML design yet. Swapping in a branded Romanian-language
template is a separate, later task once the product has real users.

| Task | Status |
|------|--------|
| Add `verificationToken` + `verificationTokenExpiresAt` to `User` model | ✅ |
| `MailModule`/`MailService` — thin wrapper over Brevo's transactional email REST API (`api.brevo.com/v3/smtp/email`), no new SDK dependency (uses native `fetch`) | ✅ |
| `register()`: create user as unverified, generate token, send verification email, do **not** issue JWT yet — return a "check your email" response instead | ✅ |
| `login()`: reject with a clear error if `isVerified` is false | ✅ |
| `POST /auth/verify-email` — validates token + expiry, sets `isVerified = true`, issues JWT tokens | ✅ |
| `POST /auth/resend-verification` — regenerates token, resends email (covers expired/lost emails) | ✅ |
| `BREVO_API_KEY`, `BREVO_SENDER`, `BREVO_SENDER_NAME` — Fly.io secrets + `.env.example` | ✅ |
| Web: `/verify-email?token=...` page that calls the endpoint and logs the user in on success | ✅ |

Note: this branched (via `db push --accept-data-loss`) at the same time as the spec-audit
Phase 0/1 work above, which independently moved to real Prisma migrations. The
`verificationToken`/`verificationTokenExpiresAt` columns were folded into the migration
history as `20260707055000_add_email_verification` (sequenced between `init` and the
versioning migration to match what's actually on production) when the two branches merged.

**Bug fixed 2026-07-07**: verification/resend emails were never delivered in production.
`mail.service.ts` read `BREVO_SENDER_EMAIL`, but the Fly secret was actually named
`BREVO_SENDER` (confirmed via the "Diagnose API" workflow's `flyctl secrets list` output) —
the name never matched, so the code silently fell back to the hardcoded
`no-reply@vallorai.com` default sender instead of the real Brevo-verified address, and
Brevo accepted the API call (register/resend both returned success) without ever actually
delivering the mail. Fixed by reading `BREVO_SENDER` (matching what's actually deployed);
`.env.example` renamed to match. No infra/secret change needed — code now matches reality.

---

## Phase 7 — BIM-level detail (brick/rebar-level 2D/3D) — IN PROGRESS

Prioritized by the product owner ahead of the remaining Phase 2 items (DXF export, geometry
validation), which are paused until this lands. Full technical detail and rationale now lives
in `CLAUDE.md`'s "BIM-detail feature" section (the original planning doc lived outside the git
repo and did not persist between sessions — `CLAUDE.md` is the durable reference from here on).

| Step | Task | Status |
|------|------|--------|
| 0 | Research real RO/HU standards for brick/rebar/plaster/insulation defaults (no invented values) | ✅ |
| 1 | Data model: `Material`/`AssemblyLayer`/`ReinforcementSpec`/`Foundation` + migration + seed (9 `GENERIC_DEFAULT` materials incl. Leiertherm 38 N+F) | ✅ |
| 2 | `packages/bim-engine` — masonry running-bond + longitudinal rebar quantity/layout calc, own build step, wired into both Dockerfiles | ✅ |
| 3 | 2D wall layer-inspector panel (`WallLayerPanel.tsx`), click-to-select wall, i18n'd, browser-verified RO/HU/EN | ✅ |
| 4 | Cost engine BOQ integration — real per-material lines replace flat masonry/plastering/painting/insulation rates once wall data exists | ✅ |
| 5 | React Three Fiber viewer foundation (extruded-box walls, LOD scaffold, no brick detail yet) | ✅ |
| 6 | Brick coursing + instancing for opening-free walls, perf-validated on one wall first | ⬜ |
| 7 | Opening-aware cut-brick generation (centimeter-precise, anchored from openings) — biggest remaining engineering risk | ⬜ |
| 8 | Longitudinal rebar instancing | ⬜ |
| 9 | Stirrup/bent rebar geometry (distinct from longitudinal, separate calc + instance pool) | ⬜ |

Also still open: the new migration `20260707071500_add_material_assembly_reinforcement` has
not yet been applied to production Neon (needs the same manual baseline/deploy treatment as
the Phase 0 migrations, via the existing `db-baseline-migrations.yml` workflow, once this
branch merges to `main`).

**Step 5 detail**: `@react-three/fiber` (`^8.18.0`) + `@react-three/drei` (`^9.122.0`) added to
`apps/web` — pinned to the last React-18-compatible major of each (fiber v9/drei v11 require
React 19), matching the existing `react@^18.3.1` pin. New
`apps/web/src/components/viewer3d/` (`Viewer3D.tsx`, `HouseScene.tsx`, `WallMesh.tsx`,
`RoomFloor.tsx`, `useLOD.ts`): walls render as extruded boxes (length/height/thickness from
each `Wall` row, positioned/rotated from its start/end points), rooms as thin floor slabs
color-coded like the 2D canvas. `useLOD` is the camera-distance LOD scaffold Step 6 will hook
real brick/rebar geometry into — thresholds (8m/25m) are placeholders pending real frame-rate
validation, not final numbers. A toggle in `EditorToolbar` (`viewMode` in `project.store.ts`)
switches the center panel between the existing Konva 2D canvas and the new 3D view; fully
i18n'd (ro/hu/en). Browser-verified against a real local Postgres + API + seeded test house
(two rooms, five exterior walls, one interior partition) via client-side navigation — toggling
2D↔3D and orbiting/zooming the 3D view (confirmed the LOD debug label changes from `far` to
`medium` on zoom). No brick/rebar detail yet, per plan — that's Steps 6-9.

Unrelated pre-existing issue noticed during verification, not introduced by Step 5 and not
fixed here (out of scope): a direct/hard-reload request to `/projects/:id/editor` 500s server-side
with `Cannot find module 'canvas'` — `react-konva`/`konva`'s optional Node canvas dependency
isn't installed, so Next's SSR of `FloorPlanCanvas.tsx` throws on a cold server-rendered hit of
that route. Reproduces identically on unmodified `main`. Client-side `<Link>` navigation into
the editor (the only way the app's own UI reaches it) is unaffected. Worth a follow-up ticket
(either add `canvas` as a dependency, or lazy-load `FloorPlanCanvas` with `next/dynamic` +
`ssr: false`) but is separate from the BIM-detail viewer work.

---

## Phase 6 — Features (Next iterations)

| Feature | Status |
|---------|--------|
| 3D viewer (Three.js) | 🔄 see Phase 7 — Steps 5-9 |
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
