# AI Home Designer — CLAUDE.md

## Project overview
AI-powered architectural SaaS targeting the Romanian market (first), then European expansion.
Primary language: Romanian. Monorepo: pnpm + Turborepo.

## Architecture
```
vallorai/
├── apps/
│   ├── api/        NestJS 10 + Fastify — REST API v1
│   └── web/        Next.js 14 App Router — Frontend
├── packages/
│   ├── types/      Shared TypeScript interfaces
│   ├── database/   Prisma schema + PrismaClient singleton
│   ├── ai-gateway/ Provider-agnostic AI adapter (Claude, OpenAI, …)
│   └── bim-engine/ Pure calc: brick coursing, rebar quantity/layout (used by both apps/api cost engine and apps/web 3D viewer)
```

## Key rules (never break these)
1. **Do NOT invent requirements** — follow only the PDF specs in `docs/materials/`
2. **Romanian Building Rules Engine** = deterministic TypeScript, NOT AI
3. **AI Gateway** must remain provider-agnostic (`AIAdapter` interface)
4. **Clean Architecture + SOLID** — modules stay decoupled
5. **Branch workflow** — develop on `claude/web-project-setup-39afuw`, PRs target `main`
6. **Language** — every user-facing string in `apps/web` MUST go through the i18n dictionary
   (`apps/web/src/locales/`), never hardcoded inline. Romanian is the default locale; Hungarian
   and English are supported and switchable at runtime. See "Internationalization" below.
7. **BIM material/spec data must come from real sources, never invented** — every default
   (`Material.specSheet`, layer thicknesses, rebar cover, etc.) must trace to a real Romanian/
   Hungarian standard (STAS, NE 0xx, SR EN, C 10x) or a real manufacturer datasheet, cited in
   a comment/seed note. If a value can't be verified against an official source (e.g. material
   prices — no official RO price index exists), it must be seeded with `specSheet.priceVerified:
   false` and the UI must surface an "unverified price" disclaimer (see `WallLayerPanel.tsx`).
   Never silently guess a number to fill a gap.
8. **New shared packages follow `packages/database`'s build pattern, never `packages/types`'s.**
   `packages/types` looks like a precedent but is dead code (zero runtime imports, no build
   step) — do not copy it. Every new shared package (e.g. `packages/bim-engine`) needs its own
   `tsc` build producing `dist/index.js`+`dist/index.d.ts`, and must be added to the explicit
   package lists in `Dockerfile.api`/`Dockerfile.web` (they hand-list packages, no turbo).
   This is not theoretical: commit `aee7519` was a real production crash-loop caused by a
   package's `main`/`types` pointing at raw `.ts` that Node couldn't execute.
9. **No emoji anywhere in the UI, no copied visual design from other products, and nothing that
   suggests the site was AI-generated** (no generic "AI tool" clichés — gradient hero banners,
   sparkle icons, boilerplate rounded cards). Audit is tracked but not yet done — see
   "BIM-detail feature" status below.

## Running locally
```bash
# Install
pnpm install

# Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Fill in DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY

# Database
pnpm db:push     # push schema to Neon
pnpm db:studio   # Prisma Studio

# Dev servers (runs both api + web)
pnpm dev
```

## API base URL
`http://localhost:3001/api/v1`  
Swagger docs: `http://localhost:3001/api/docs` (dev only)

## Auth
JWT Bearer tokens. accessToken expires in 15 min, refreshToken 30 days.
Stored in localStorage by the web app; interceptor auto-refreshes on 401.

## AI configuration
Set `AI_PROVIDER` in `apps/api/.env` — value is matched case-insensitively against `GEMINI`/`CLAUDE`/`OPENAI`
(defaults to `GEMINI` if unset). Model defaults: `gemini-flash-latest` (Google's maintained alias to their
current recommended flash model — do not pin a dated model name like `gemini-1.5-pro` again, Google retires
these; see PROGRESS.md's 2026-07-07 incident note) / `claude-sonnet-5` / `gpt-4o`.
`packages/ai-gateway`'s `AIGateway` only ever registers a provider that actually has a non-empty API key, so
the app can never silently select a misconfigured/unfunded provider — as of this writing only `GEMINI_API_KEY`
is set anywhere (Fly secrets or `.env`), so Gemini (free tier) is the only provider actually in use.
System prompts (ro/en/hu, selected via `getSystemPromptForLanguage`): `apps/api/src/modules/ai/prompts/system.prompt.ts`

**Free-tier quota exhaustion**: if the active provider's API call fails with a rate-limit/quota error
(`AIQuotaExceededError`, detected in `packages/ai-gateway/src/errors.ts` and thrown by `GeminiAdapter`),
`AiService` (`apps/api/src/modules/ai/ai.service.ts`) checks the `AppSettings.allowPaidAiProviders` flag
(`apps/api/src/modules/settings`) before doing anything else:
- If `true` **and** a different provider actually has a real API key configured, it retries the request on
  that provider.
- Otherwise it throws a `503 SERVICE_UNAVAILABLE` (surfaced to `apps/web`'s `AiChat.tsx` as a dedicated
  `t.aiChat.quotaExceeded` message, not the generic error).
`allowPaidAiProviders` defaults to `false` and can only be changed via `GET`/`PATCH /settings/ai`, restricted
to the `SUPERADMIN` role (`RolesGuard`/`@Roles()` in `apps/api/src/common`) — there's a minimal toggle UI at
`apps/web/src/app/(dashboard)/admin/ai-settings` (only linked from the sidebar for a `SUPERADMIN` user).
No user is seeded as `SUPERADMIN` — promote one by hand (`UPDATE "User" SET role = 'SUPERADMIN' WHERE
email = '...'`) once this ships.

## Internationalization (i18n)
Three supported locales: `ro` (default) · `hu` · `en`. Structure:
- `apps/web/src/locales/types.ts` — the `Dictionary` interface (single source of truth for shape) + `LOCALES`/`DEFAULT_LOCALE`
- `apps/web/src/locales/{ro,hu,en}.ts` — one dictionary per language, each `satisfies Dictionary` (TS enforces every language has every key — a missing translation is a compile error, not a silent fallback)
- `DATE_LOCALES` (also in `types.ts`) — BCP-47 tag per locale (`ro-RO`/`hu-HU`/`en-US`) for `Date#toLocaleDateString(DATE_LOCALES[locale])` and similar formatting
- `apps/web/src/store/locale.store.ts` — Zustand store (persisted to localStorage) holding the active locale
- `apps/web/src/lib/useTranslation.ts` — `const { t, locale, setLocale } = useTranslation()`; use `t.section.key` in components, never a hardcoded string
- `apps/web/src/components/layout/LanguageSwitcher.tsx` — the RO/HU/EN toggle (mounted in the auth layout header and the dashboard `TopBar`); also best-effort syncs the choice to `PATCH /users/me { language }` so the backend `User.language` field (and therefore the AI system prompt language — see `apps/api/src/modules/ai/prompts/system.prompt.ts`) follows the same preference for logged-in users

**Adding a new user-facing string**: add the key to `Dictionary` in `types.ts` first, then fill in all three locale files (TS will error on any file missing it), then consume it via `t.x.y` in the component. Do not add a fourth "just for now" hardcoded string anywhere — extend the dictionary instead, even for a single word.

Every page and component is migrated as of this writing: auth (`RegisterForm`/`LoginForm`/`VerifyEmailHandler`), the landing page, `Sidebar`/`TopBar`, the projects list/detail pages, the floor-plan editor (`EditorLayout`/`EditorToolbar`/`RoomPanel`), and `AiChat`. The only known exceptions are Next.js `metadata` (page `<title>`) exports — those are server-rendered and can't reactively follow the client-side locale store without a bigger routing change, so they stay hardcoded in Romanian; this is an accepted limitation, not a bug. Any brand-new page/component must follow the same pattern from day one.

## Database models (key ones)
User → Project → House → Room / Wall / Opening
House → Foundation
Wall / Foundation → AssemblyLayer (ordered layer stack, e.g. render/block/plaster/paint) → Material
Wall / Foundation → ReinforcementSpec (LONGITUDINAL / STIRRUP rebar)
Project → Plot / Lifestyle / Budget / CostEstimate / Document / Message

`AssemblyLayer`/`ReinforcementSpec` use a polymorphic-parent pattern: nullable `wallId`/
`foundationId` FKs plus a raw-SQL Postgres `CHECK` constraint enforcing "exactly one parent
set" (Prisma has no native polymorphic relation — see the `_exactly_one_parent` constraints
in the `add_material_assembly_reinforcement` migration).
`Material.source` is `GENERIC_DEFAULT` (researched standard default) or `MANUFACTURER` (future
marketplace product); `Material.supplierId` is already nullable-FK-ready for that later phase.

`AppSettings` is a single-row table (fixed `id: "singleton"`) for app-wide `SUPERADMIN`-only toggles —
started with `allowPaidAiProviders` (see "AI configuration"); add more columns to this same row rather than
creating a new singleton table per setting.

## Romanian Building Rules
Validated in `apps/api/src/modules/rules/rules.service.ts`.
Returns `ValidationResult` with `violations[]`, `passedRules[]`, `permitReadiness` (%).
Permit docs: DTAC, PTh, DDE, PAC, POE.

## Deployment targets
- **API**: Fly.io (Node.js)
- **Web**: Vercel or Fly.io static
- **DB**: Neon PostgreSQL
- **Storage**: Cloudflare R2

## SaaS plans
FREE · PRO · BUSINESS · ENTERPRISE

## User roles
GUEST · USER · CLIENT · ARCHITECT · STRUCTURAL_ENGINEER · MEP_ENGINEER ·
ELECTRICAL_ENGINEER · CONTRACTOR · MANUFACTURER · SUPPLIER · ADMIN · SUPERADMIN

`SUPERADMIN` is distinct from `ADMIN` — it's the only role allowed to change app-wide settings
(currently just `AppSettings.allowPaidAiProviders`, see "AI configuration" above), enforced by the
`RolesGuard`/`@Roles()` pair in `apps/api/src/common`. No user has this role by default.

## BIM-detail feature (brick/rebar-level 2D/3D detail) — status

**Goal** (user requirement, not to be re-negotiated without asking): the 2D/3D drawing must
eventually show literal per-brick and per-rebar geometry — not an abstracted layer diagram —
plus a clickable spec view per wall layer (material, thickness, standard ref, unit price).
Cut bricks around openings must be real, centimeter-precise geometry, with coursing starting/
ending at openings using half-bricks for correct masonry bonding. Default exterior wall
material is a Leier 38 brick (seeded as `Leiertherm 38 N+F`). All defaults must trace to real
standards (see Key rule 7). Later, a manufacturer/supplier marketplace product will be
selectable per layer, replacing the generic default with real spec + real pricing — the data
model (`Material.source`/`supplierId`) is already built for this, no rework needed.

### Done (Steps 0–4)

- **Research** (Step 0): real values gathered for Leiertherm 38 N+F (380×250×238mm, λ=0.16
  W/mK, 16 pcs/m², tongue-and-groove = no vertical mortar joint, 26 l/m² mortar), solid brick
  STAS 2945/73 (240×115×63mm), masonry bonding rules (RO normativ P2-85 zidărie: 12mm bed /
  10mm head joint, courses offset ≥1/4–1/2 brick), rebar SR 438-1:2012 (diameters
  6–32mm, grades OB37/PC52/PC60/B500C), plaster NE 001/1996, insulation C 107/3-2005, concrete
  NE 012/1-2022 & NE 012/2-2022. No official RO price index exists — Bursa Construcțiilor
  (constructiibursa.ro) is used as a non-official reference; all seeded prices carry
  `specSheet.priceVerified: false` + a `priceSource` note.
- **Step 1 — data model**: `Material`/`AssemblyLayer`/`ReinforcementSpec`/`Foundation` added to
  `packages/database/prisma/schema.prisma`, migration
  `20260707071500_add_material_assembly_reinforcement` (includes the polymorphic-parent CHECK
  constraints). `packages/database/prisma/seed.ts` seeds 9 `GENERIC_DEFAULT` materials.
- **Step 2 — `packages/bim-engine`**: new shared package, built per Key rule 8 (own `tsc`
  build, added to both Dockerfiles). Pure calc, zero `three`/WebGL dependency so the same code
  serves both the API cost engine and the future browser 3D viewer:
  - `masonry.ts` — `calculateBrickQuantity`/`generateBrickLayout`, running-bond algorithm
    (half-brick offset on alternating courses), opening-free walls only so far (opening-aware
    cutting is Step 7, not yet built).
  - `rebar.ts` — `calculateLongitudinalRebarQuantity`/`generateLongitudinalRebarLayout`
    (`LONGITUDINAL` role only; `STIRRUP` exists in the Prisma enum but has no calc yet — Step
    9).
  - Both validated by unit tests against hand-calculated reference values.
- **Step 3 — 2D layer-inspector UI** (shipped ahead of 3D on purpose — real value without
  waiting for the much larger 3D work): clicking a wall in `FloorPlanCanvas.tsx` selects it
  (`project.store.ts`'s `selectedWallId`); `EditorLayout.tsx` swaps the right panel to the new
  `WallLayerPanel.tsx`, which calls `useWallLayers(wallId)` → `GET
  /houses/walls/:id/layers` → `HousesService.getWallLayers` (auto-provisions a default 4-layer
  exterior / 3-layer interior assembly on first access, idempotent). Shows material, thickness,
  standard ref, unit price per layer, and the unverified-price disclaimer banner. Fully
  translated (`editor.layerPanel.*` in all 3 locale files). Verified in a real browser in
  RO/HU/EN.
- **Step 4 — cost engine BOQ integration**: `costs.service.ts`'s `estimateByArea` now computes
  real per-material bill-of-quantities lines from each wall's actual assembly (via
  `calculateWallAssemblyBoq` → `bim-engine`), replacing the flat `masonry`/`plastering`/
  `painting`/`insulation` area-rate guesses once wall data exists (other categories like
  foundation/roof/MEP keep the flat rate — no real BOQ source yet). Same `CostItem[]`+`total`+
  `currency` contract preserved. Covered by `apps/api/test/cost-boq.e2e-spec.ts`.

- **Step 5 — React Three Fiber viewer foundation**: `@react-three/fiber` (`^8.18.0`) +
  `@react-three/drei` (`^9.122.0`) added to `apps/web` — pinned to the last React-18-compatible
  major of each (v9 fiber / v11 drei require React 19, and the app is on `react@^18.3.1`). New
  `apps/web/src/components/viewer3d/`:
  - `Viewer3D.tsx` — the `<Canvas>` (lighting, grid, `OrbitControls`), swapped in for
    `FloorPlanCanvas` when `viewMode` is `'3d'`.
  - `HouseScene.tsx` — centers the house at the origin (bounding-box of all wall/room
    coordinates) and maps `Wall`/`Room` rows into meshes.
  - `WallMesh.tsx` — one extruded box per wall (length/height/thickness from the row, positioned
    and rotated from its start/end points); no brick detail yet.
  - `RoomFloor.tsx` — a thin floor slab per room, same color-by-type coding as the 2D canvas.
  - `useLOD.ts` — the camera-distance LOD scaffold: `far`/`medium`/`detail` tiers off two
    placeholder distance thresholds (not yet perf-tuned against real geometry). Steps 6-9 hook
    real brick/rebar geometry into this instead of re-deriving distance logic.
  - A `viewMode: '2d' | '3d'` toggle (`project.store.ts`, `EditorToolbar.tsx`) switches the
    editor's center panel between the Konva 2D canvas and the new 3D view. i18n'd in all 3
    locales (`editor.toolView2d`/`toolView3d`/`viewer3d.lodLabel`).
  - Browser-verified end-to-end: local Postgres + real API + a seeded test house (two rooms,
    five exterior walls, one interior partition), navigated client-side into the editor (not a
    hard reload — see the pre-existing SSR caveat below), toggled 2D↔3D, and confirmed the LOD
    debug label changes from `far` to `medium` while orbiting/zooming.
  - **Unrelated pre-existing issue found during verification, not fixed here**: a hard/direct
    request to `/projects/:id/editor` 500s server-side with `Cannot find module 'canvas'` —
    `react-konva`/`konva`'s optional Node canvas dependency isn't installed, so Next's SSR of
    `FloorPlanCanvas.tsx` throws on a cold server-rendered hit of that route. Reproduces
    identically on unmodified `main`, so it predates this work. The app's own `<Link>`
    client-side navigation into the editor is unaffected. Worth a follow-up (add `canvas` as a
    dependency, or `next/dynamic(..., { ssr: false })` for `FloorPlanCanvas`) but out of scope
    for the BIM-detail viewer.

- **Step 6 — brick coursing + instancing (opening-free walls)**: the LOD `detail` tier now
  renders real per-brick geometry for every wall whose STRUCTURAL layer has unit-masonry
  dimensions in its material specSheet.
  - `packages/bim-engine` grew two new pure modules (unit-tested like the rest):
    `spec-sheet.ts` (`brickModuleFromSpecSheet` — maps `Material.specSheet` JSON to a
    `BrickModule`; NE 001/1996 / C 126-75 default joints of 12/10mm, head joint 0 when
    `specSheet.tongueAndGroove` is true, per the Leier N+F laying instructions) and
    `instancing.ts` (`generateWallBrickInstances`/`composeBrickInstanceMatrices` — running-bond
    layout composed into column-major 4×4 instance matrices in meters, directly usable as an
    `InstancedMesh.instanceMatrix` buffer over a unit box; wall-placement convention matches
    `WallMesh`'s `rotationY = -atan2(dz, dx)`). The seeded masonry specSheets now carry
    explicit `bedJointMm`/`headJointMm` with citations.
  - `apps/web` (now depends on `@ai-home-designer/bim-engine`, added to `transpilePackages`):
    `useBrickInstances.ts` fetches every wall's layers via `useQueries` (shared
    `['wall-layers', id]` cache with `WallLayerPanel`), runs transform generation in a plain
    Web Worker (`brick-layout.worker.ts`, `new Worker(new URL(...))` — no comlink needed;
    buffers returned as transferables, zero main-thread jank), caches per
    `wallId + layer-spec hash`, and pools instances per **material × floor** — draw calls stay
    bounded regardless of wall count. `BrickInstances.tsx` renders one `InstancedMesh` per pool
    (`castShadow`/`receiveShadow` explicitly false; cut bricks tinted darker via
    `instanceColor`; `meshLambertMaterial` because per-pixel PBR cost dominates when bricks
    fill the screen). `WallMesh` gained a `mortarCoreWidthM` variant: in detail mode the wall
    box shrinks to a mortar-colored core inset inside the brick envelope, so the 12mm bed
    joints read as mortar instead of gaps.
  - `useLOD` fix: it measured camera distance to the house group's `position` — which is the
    recentering *offset*, not the visual center — so `detail` was unreachable on off-center
    houses. It now measures distance to the house's world center (the origin after
    recentering).
  - Browser-verified end-to-end (local Postgres + API + seeded 10×8m house, 4 Leier-38
    exterior walls + 1 solid-brick partition): zooming under 8m swaps boxes → 2,774 bricks
    (shown in the debug overlay via the new `viewer3d.brickCountLabel`/`masonryComputing`
    i18n keys, all 3 locales), correct running bond with cut half-bricks, N+F walls show no
    vertical joints, orbiting stays interactive, zooming out swaps back. Frame rate in the
    headless container (SwiftShader software GL, no GPU) dropped 36→10 FPS at detail tier —
    not representative of real hardware (~3k instances in 3 draw calls is trivial for any
    GPU), so the 8m/25m LOD thresholds stand, but **re-check FPS on a real GPU before scaling
    to multi-floor houses** and tighten `LOD_NEAR_M` if needed.
  - **Performance hardening (follow-up to the FPS finding above)**: `Viewer3D`'s Canvas now
    requests the discrete GPU (`powerPreference: 'high-performance'`) and scales resolution
    adaptively — drei `PerformanceMonitor` raises `dpr` to the display's native ratio on
    machines that hold frame rate and drops it to 1 on ones that don't. If the browser has
    **no hardware acceleration at all** (SwiftShader/llvmpipe/Basic Render detected via
    `WEBGL_debug_renderer_info`, or `PerformanceMonitor` `onFallback` fires), the viewer
    latches a low-perf mode: the brick-detail LOD tier is withheld (boxes stay smooth) and an
    i18n'd notice (`viewer3d.lowPerfNotice`) explains why. A rolling FPS readout
    (`viewer3d.fpsLabel`) joined the debug overlay. E2E escape hatch for headless/software-GL
    test browsers: `localStorage['viewer3d.ignoreLowPerf'] = '1'` skips the latch (this is how
    the brick path stays browser-verifiable in CI containers — both paths verified: default
    run stays at `medium` with the notice, override run renders the 2,774 bricks).

### Next (Steps 7–9, not started)

7. **Opening-aware cut-brick generation** — the largest unresolved engineering risk. Real,
   individually-modeled (not instanced) cut bricks at the jambs/lintel of each `Opening`,
   centimeter-precise per `Opening.position/width/height/sillHeight`, with coursing anchored
   from the opening using half-bricks. Only the bricks touching an opening need this — the bulk
   of a wall away from openings stays instanced whole-brick.
8. **Longitudinal rebar instancing** — render `bim-engine`'s existing
   `generateLongitudinalRebarLayout` output as instanced straight cylinders.
9. **Stirrup/bent rebar** — needs both a new `bim-engine` calc function (stirrups are a bent
   closed loop, not a straight bar — geometrically distinct from longitudinal rebar) and a
   separate instance pool/geometry in the 3D viewer.

Full original architecture writeup (context, source table, detailed rationale per step) lived
in a session plan file outside this repo and did not persist — the above is the durable
reference going forward. Keep this section updated as Steps 5–9 land.

## Spec documents
All 13 PDFs in `docs/materials/` are the source of truth.
Never add functionality not described there.
