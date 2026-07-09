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
   sparkle icons, boilerplate rounded cards). **Audit done 2026-07-09**: every emoji glyph
   replaced with lucide-react icons (sidebar, editor toolbar, AI chat greeting, project quick
   actions/cards); the landing page's gradient hero + rounded shadow cards replaced with a flat
   architectural layout (CSS-drawn floor-plan sketch — door swings, window marks, dimension
   line — as the hero visual; top-ruled feature columns). An emoji scan of `apps/web/src`
   reports zero hits — keep it that way for all new UI.

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

### AI chat → actual House/Room data (fixed 2026-07-07)

The AI's structured reply (`design-response.schema.ts`: `message` / `design_update` /
`next_question` / `ai_justification` — the shape the system prompts instruct it to always
return) was being parsed and saved to `Message.metadata`, but **`design_update` was never
applied to the database** — the chat could talk through an entire house design without a single
`Room` ever being created, and the raw JSON envelope was rendered verbatim in the chat bubble
(no client-side parsing) instead of just `message`/`next_question`. A real user reported this as
"the AI can't build what we discussed," which is exactly what was happening: the conversation
was real, the plan was not.

Fixed in `apps/api/src/modules/ai/`:
- `design-update-mapper.ts` (pure, unit-tested) — `roomFromDesignUpdateData` maps one
  `ADD_ROOM`/`UPDATE_ROOM` `data` payload (loosely typed — the prompt only sketches `data: {}`)
  to concrete `Room` fields: RO/HU floor-name resolution (`parter`/`etaj`/`emelet`/…), a
  placeholder rectangle from `suggested_area_sqm` alone (no floor-plan solver exists — see the
  BIM-detail roadmap above), and `DEFAULT_ROOM_HEIGHT_M` matching `Wall.height`'s default.
  `nextRoomPosition` lays each new room next to its floor's existing rooms, non-overlapping;
  every floor's row starts at (0,0) — the old `FLOOR_ROW_HEIGHT_M` flat-view Y offset was
  removed (2026-07-08, with a `flatten_room_rows` data migration inverting it on existing
  rooms) once `FloorPlanCanvas` grew a real floor switcher and the 3D viewer started stacking
  floors by elevation (see "AI rooms → generated walls" below).
- `AiService.applyDesignUpdate` — called after every chat turn now. `ADD_ROOM` creates a room;
  `UPDATE_ROOM` looks for an existing room on the same floor with an exact `type` match and
  updates it in place, else falls back to creating one (the AI's `room_type` wording drifts
  between turns — e.g. `living_room` → `living_room_and_kitchen` — so an exact-match-or-create
  heuristic is used rather than fuzzy-matching free text across turns; this can leave a stale
  duplicate room the user deletes via the existing trash-icon action in `RoomPanel.tsx`).
  Non-room updates (the AI's whole-house "global" style/summary turns, any `ADD_WALL` — never
  observed to actually carry wall geometry) are safely skipped, not guessed at.
- `AiService.rebuildFromConversation` (`POST /ai/projects/:id/rebuild`, "Construiește planul din
  conversație" button in `AiChat.tsx`) replays the `design_update` already stored in every
  assistant message's `metadata` and applies whichever ones weren't applied yet — idempotent
  (an `appliedRoom` marker is written back onto each message once handled). This is what repairs
  a project whose conversation happened before this fix shipped, without the user re-typing
  anything: their prior `design_update` turns were always saved, just never used.
- `apps/web/src/lib/parseAssistantMessage.ts` + `AiChat.tsx` — chat bubbles now show
  `message`/`next_question`, not the raw JSON envelope; an `appliedRoom`-derived badge
  ("Cameră adăugată/actualizată la plan" — `aiChat.roomAdded`/`roomUpdated`, all 3 locales)
  confirms when a turn actually changed the plan.
- Both `AiController` endpoints now thread `req.user.id` through and call the same
  `ProjectsService.assertOwnership` the rest of the app uses (made public for this reuse) —
  `chat`/`stream`/`conversation`/`rebuild` previously had no ownership check at all.

### AI rooms → generated walls + real floor handling (fixed 2026-07-08)

The gaps the paragraph above used to document are now closed (a real user hit all of them at
once: their AI-designed 2-storey house rendered as a few flat grey slabs — no walls, no bricks,
floors splayed side by side):
- **Walls are now derived from the AI's rooms.** `packages/bim-engine/src/wall-generation.ts`
  (pure, unit-tested): `deriveWallsFromRooms` turns each floor's room rectangles into wall
  segments — perimeter edges become exterior load-bearing walls (0.38m, matching the default
  Leiertherm 38 assembly), edges shared by two rooms become ONE interior partition (0.24m,
  matching the default solid-brick assembly). Near-parallel edges cluster within
  `LINE_CLUSTER_TOLERANCE_M` (0.45m) so the mapper's 0.3m inter-room gap reads as one shared
  wall, and interval endpoints snap to the perpendicular wall lines so facades run continuously
  across rooms instead of leaving corner slits. Honest placeholder geometry, not a floor-plan
  solver — same stance as `ROOM_ASPECT_RATIO`.
- `Wall.isGenerated` (migration `add_wall_is_generated_flatten_room_rows`) marks derived walls;
  `HousesService.regenerateGeneratedWalls` deletes+re-derives them (one transaction) after every
  AI ADD_ROOM/UPDATE_ROOM, on rebuild, and on room deletion when generated walls exist.
  User-drawn walls are never touched. Because assemblies auto-provision lazily on read
  (`getWallLayers`), regenerated walls immediately carry real material stacks — so the 3D brick
  detail tier and the cost engine's wall BOQ work on AI-designed houses with no extra step.
  Covered by `apps/api/test/wall-generation.e2e-spec.ts`.
- **2D floor switcher**: `EditorToolbar` shows a Parter/Etaj n/Subsol segmented control (i18n'd
  `editor.floorGround`/`floorUpper`/`floorBasement`, hidden for single-floor houses);
  `FloorPlanCanvas` filters rooms+walls by `project.store.ts`'s `activeFloor` (switching clears
  the selection).
- **3D floor stacking**: `HouseScene` lifts every room slab, wall mesh and brick/rebar instance
  pool to `floor * LEVEL_HEIGHT_M` (2.7m — a rendering constant matching `Wall.height`'s
  default, not a storey-height spec; there is still no slab/storey model).

Still open: the AI's `ADD_WALL` action remains unhandled (never observed to carry usable
geometry); no doors/windows are AI-generated, and regenerating drops openings that were manually
added to a *generated* wall (they cascade with the wall row — put openings on manual walls, or
re-add them once the room plan settles). **Closed 2026-07-09**: the manual "Adaugă perete"
toolbar mode is now wired (click-to-start, dashed preview, click-to-finish with 0.5m snap and
segment chaining, Esc cancels; add-room places a default 4×3m room the same way), and openings
are user-manageable — `OpeningsPanel` inside the wall inspector lists the selected wall's
openings with their auto-provisioned lintel spec, adds doors/windows (fit-validated against the
wall length) and deletes them via the new `DELETE /houses/openings/:id`.

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
This is the **livability/permit** rule set (min room areas, required rooms, corridor width) —
distinct from the structural "law modules" below, which drive what the system actually builds.

## Romanian structural building-code "law modules" — status

**Goal** (user requirement, explicit direction 2026-07-08): every structural default the system
builds with — foundation depth/concrete/rebar, confined-masonry tie-columns (`stâlpișori`) and
ring beams (`centuri`), frame-column reinforcement, concrete cover — must trace to a real,
cited Romanian standard, the same way Key rule 7 already requires for `Material.specSheet`.
Rolling out one self-contained module at a time (data model + `bim-engine` pure calc + tests +
API + citation), same pattern as the BIM-detail steps above. `docs/materials/`'s 13 PDFs do
**not** contain civil-engineering standards (they're this app's own frontend/API/DB/prompt
specs) — every citation below came from external research (STAS/NP/CR/EN standard text and
technical-press summaries of it), not from `docs/materials/`.

### Done

- **Module 1 — Foundation (fundație)**: `packages/bim-engine/src/foundation.ts` (unit-tested):
  - `resolveFrostDepthMm(locality)` — minimum foundation depth per **STAS 6054-77** ("Adâncimi
    maxime de îngheț"), which is a nationwide isoline map, not a per-județ table; the standard
    only tabulates a handful of reference localities plus the nationwide range (600–1100mm, avg
    ~750mm). `FROST_DEPTH_MM_BY_LOCALITY` cites the exact values for București/Cluj/Iași (900mm),
    Timiș/Timișoara/Constanța (800mm), Brașov/Botoșani/Dorohoi (1000mm). An unmatched or missing
    locality returns `FALLBACK_FROST_DEPTH_MM` (900mm — the max among the cited lowland
    localities) with `verified: false`, surfaced the same way `specSheet.priceVerified` is
    surfaced — a real STAS ceiling, not an invented number, but not confirmed against a
    site-specific geotechnical study either (STAS 6054-77 itself excludes altitudes >1000m and
    the Danube Delta from any table-based value).
  - `deriveStripFootingWidthMm(wallThicknessMm)` — wall thickness + 150mm overhang per side
    (commonly cited constructive rule for ordinary residential loads), floored at 600mm. The
    load-driven width a specific soil/wall actually needs is a geotechnical calculation (NP
    112-2014 Part I) this does not perform.
  - `deriveStripFootingReinforcement()` — **NP 112-2014** continuous-footing constructive
    minimums: transverse resistance bars (across the footing width) Ø10mm @ 250mm spacing;
    longitudinal distribution bars (along the footing run) Ø6mm @ 250mm. Always the code floor,
    not load-sized.
  - `STRIP_FOOTING_COVER_MM = 40` — **EN 1992-1-1 §4.4.1.3(4)** (the basis for NE 012/1-2022
    Annex J): 40mm minimum cover for concrete cast against prepared ground/blinding (this
    footing sits on a lean-concrete layer, not directly on soil, which would need 75mm). As with
    the seeded concrete-cover note elsewhere, a structural engineer must confirm the exact
    Romanian national-annex figure before construction use.
  - Lean/leveling concrete (`beton de egalizare`) under the footing: C8/10, 100mm, unreinforced —
    widely-cited constructive practice, not part of the structural design. Structural footing
    concrete: C16/20 (NP 112-2014/NE 012-2022's typical minimum for an ordinary residential strip
    footing).
  - `RebarRole` gained a `TRANSVERSE` value (migration `add_transverse_rebar_role`) — a strip
    footing's two rebar mats aren't both "longitudinal" in the wall/column sense; distribution
    bars (parallel to the footing run) reuse `LONGITUDINAL`, resistance bars (perpendicular) are
    the new `TRANSVERSE`.
  - Two new seeded `GENERIC_DEFAULT` materials: `Beton de egalizare C8/10`, `Beton C16/20` (both
    cite NP 112-2014 / NE 012/1-2022, `priceVerified: false` like every other seeded price).
  - `HousesService.getFoundation(houseId)` (`GET /houses/:id/foundation`) auto-provisions one
    `Foundation` row + its two `AssemblyLayer`s (lean + structural concrete) + two
    `ReinforcementSpec`s (TRANSVERSE + LONGITUDINAL) on first access, idempotent — mirrors
    `getWallLayers`, not `getWallReinforcement`'s "don't invent" stance, because *every* house
    needs some foundation (unlike a wall, which may legitimately carry no rebar). Depth/width are
    derived from the house's actual load-bearing wall thickness and the project's `Plot.county`/
    `Plot.city`. `depthVerified` is recomputed from the *current* Plot locality on every read
    rather than persisted at provision time, so filling in the site address later doesn't leave a
    stale "unverified" flag. Covered by `apps/api/test/foundation.e2e-spec.ts` (verified-locality
    depth, fallback-locality depth, idempotency).
  - UI + BOQ done 2026-07-09: `StructuralPanel.tsx` (editor right sidebar, shown when no wall is
    selected) surfaces depth/width/concrete/rebar with the unverified-depth notice, and
    `costs.service.ts` emits real foundation concrete + steel lines (see the structural-BOQ note
    under "BIM-detail feature" Step 4's cost engine below/`calculateStructuralBoq`).

- **Module 2 — Confined masonry: stâlpișori (tie-columns) + buiandrug (lintels), CR6-2013**.
  **Correction from the original module-2 plan above**: an earlier (unshipped) draft assumed a
  tie-column was required flanking every door/window opening jamb. A user correction plus
  follow-up research established this is wrong — CR6-2013 defines three tie-column categories:
  **S1** (every corner/T/X wall-intersection, always required), **S2** (intermediate columns
  limiting spacing to ≤4–5m along a run), and **S3** (columns flanking an opening, but only
  *conditionally*: high-seismicity zones ag≥0.25g + openings ≥1.5m², or lower zones + openings
  ≥2.5m², or when residual masonry pier-length minimums aren't met). **S1, S2 and now S3 (the
  area+ag branch) are implemented** — see the "Module 2b" entry below for the S3 addition. Only
  the residual-pier-length trigger of S3 remains a documented gap (no confirmed primary-source
  threshold). A plain below-threshold opening jamb correctly gets **no** column — instead,
  every opening gets a **lintel (buiandrug)**, which is the actual, always-required tying-
  together element over an opening (separately confirmed as standard/effectively-mandatory
  practice, prefabricated by default).
  - `packages/bim-engine/src/confined-masonry.ts` (unit-tested):
    - `detectCornerAndIntersectionPoints` — S1 geometry: clusters load-bearing wall endpoints
      (5cm tolerance) and flags non-collinear 2-way joins (a real corner, angle test at 5°
      tolerance — a straight 2-wall collinear join is correctly *not* a corner, since it's one
      physical run split into two `Wall` rows) and any ≥3-way junction; separately detects a
      wall endpoint landing on another wall's *interior* span (a T-junction, e.g. an interior
      partition meeting an exterior wall mid-run) via point-to-segment projection.
    - `detectMidSpanTieColumns` — S2 geometry: for a load-bearing wall longer than
      `MAX_TIE_COLUMN_SPACING_M` (4.0m — the conservative/tighter end of the cited 4–5m range,
      since this project has no "sparse vs dense wall plan" classification to pick the looser
      5m), evenly-spaced intermediate points so no gap exceeds the max.
    - `deriveTieColumnReinforcement` — CR6-2013 constructive minimums: 250×250mm cross-section,
      4×Ø14mm longitudinal (the *higher*-seismicity-zone bar size, used unconditionally as a
      safe/conservative default in the absence of a cited ag-by-locality table — 4×Ø14 always
      satisfies the lower-zone 4×Ø12 minimum too, just over-conservatively), Ø6mm stirrups at
      150mm, 25mm cover (EN 1992-1-1 Table 4.4N, exposure class XC1 — dry/interior element),
      C12/15 minimum confining-element concrete class (CR6-2013 / Normativ 12/2008 Tab. 1).
    - `deriveLintelSpec` — prefabricated by default (Porotherm A12 or equivalent product line);
      250mm bearing into the wall on each side (manufacturer datasheet — a separate secondary
      source cites a much larger >400mm figure, but that appears to describe non-structural
      infill-panel masonry in RC-frame buildings, not this case, so the datasheet figure is
      used, flagged for engineer confirmation); length = opening width + 2×bearing; width =
      wall thickness. Monolithic cast-in-place lintel reinforcement (bar count/diameter/
      stirrups) has no primary-source citation this project could find — deliberately not
      generated, not guessed.
  - `ReinforcementSpec` gained `tieColumnId` (extending the polymorphic-parent CHECK to
    wall/foundation/tie-column, exactly one) and a nullable `barCount` — a tie-column's 4 fixed
    corner bars aren't a spacing-derived count the way a wall/footing mat's bars are, so
    `spacingMm` alone (as used for those) couldn't represent it; `barCount` is set for the
    tie-column's `LONGITUDINAL` row, left null elsewhere.
  - New models: `TieColumn` (owned by `House` directly, not a specific `Wall` — a corner column
    is naturally shared by the ≥2 walls that meet there) and `Lintel` (1:1 with `Opening`, FK to
    a `Material` for the prefab product — no `ReinforcementSpec` relation, per the "not modeled"
    reasoning above). `MaterialCategory` gained `PRECAST`. Seeded `Beton C12/15` and
    `Buiandrug prefabricat` (Porotherm A12 citation) `GENERIC_DEFAULT` materials.
  - `HousesService.getTieColumns(houseId)` (`GET /houses/:id/tie-columns`) auto-provisions S1+S2
    (+S3, see Module 2b) placements (computed per floor) + their reinforcement, idempotent like
    `getFoundation`. `HousesService.getLintel(openingId)` (`GET /houses/openings/:id/lintel`)
    auto-provisions one `Lintel` per opening, idempotent. Covered by
    `apps/api/test/confined-masonry.e2e-spec.ts` (corner placement, mid-span spacing,
    **no column beside a plain below-threshold opening** — the corrected behavior — S3 jamb
    placement, lintel bearing/dimensions, idempotency of both).
  - UI/BOQ/3D done 2026-07-09: `StructuralPanel.tsx` shows S1/S2/S3 counts + section/rebar;
    `calculateStructuralBoq` emits tie-column concrete + cage steel and one prefab lintel line
    per opening; BIM-detail Step 9 renders the instanced concrete shafts + full rebar cages
    (bars + stirrup loops) at the detail LOD tier. Lintel specs surface per opening in
    `OpeningsPanel`.

- **Module 2b — S3 tie-columns (opening-triggered) + seismic ag lookup, CR6-2013 / P100-1/2013**.
  Fills the S3 gap the Module 2 entry documented. **Citation-confidence note**: the two opening-
  area thresholds (1.5m² for ag≥0.25g, 2.5m² below) and the ag=0.25g boundary were cross-checked
  across two independently-phrased searches converging on identical values; official PDF hosts
  (encipedia, kapal.ro, icase.ro, MDLPA) all returned HTTP 403 in this environment, same
  systematic block Module 3 hit — so this is secondary-corroborated, not primary-quoted. An
  engineer must confirm against an official CR6-2013 / P100-1/2013 copy.
  - `packages/bim-engine/src/seismic.ts` (unit-tested) — `resolveSeismicAg(locality)` returns the
    P100-1/2013 design ground acceleration ag for a locality, mirroring `foundation.ts`'s
    `resolveFrostDepthMm` exactly: a small `AG_BY_LOCALITY` map of only cross-checked cited values
    (București 0.30g, Iași 0.25g, Focșani/Vrancea 0.40g national max, Cluj 0.10g national min),
    and a conservative `FALLBACK_AG_G` (= the 0.25g high-seismicity threshold, `verified:false`)
    for any unmatched locality so the *stricter* S3 rule applies when the site ag is unknown —
    over-provisioning, never under-provisioning (consistent with every other "default toward more
    structure" choice). The full by-locality table is deliberately NOT invented (Key rule 7).
  - `confined-masonry.ts` gained `TieColumnCategory` value `'S3'`, `WallOpeningForConfinement`,
    `openingConfinementThresholdSqm(agG)`, `detectOpeningTieColumns(walls, openings, agG)` (a
    column at each jamb of an over-threshold opening on a load-bearing wall), and
    `deriveTieColumnPlacements` now takes optional `openings`+`agG` and merges S3 in, deduped
    against S1/S2 (a jamb coinciding with a corner isn't doubled). Passing no openings reproduces
    the prior S1+S2 result byte-for-byte (regression-tested). S3 columns reuse the same
    conservative `deriveTieColumnReinforcement` (4×Ø14) — reinforcement is unchanged.
  - `TieColumnCategory` enum gained `S3` (migration `add_s3_tie_column_category`, an
    `ALTER TYPE … ADD VALUE`). `HousesService.getTieColumns` now loads the house's openings +
    the project's `Plot.county`/`city` and threads `resolveSeismicAg(locality).agG` into
    provisioning (per floor, openings matched to their host wall's floor). Covered by two new
    `confined-masonry.e2e-spec.ts` cases (large opening → 2 S3 jambs in the default high zone; a
    2.0m² opening → **no** S3 in Cluj/0.10g, exercising the ag lookup).
  - Not yet done: the residual-pier-length S3 trigger (no confirmed threshold — still a gap).
    UI panel / cost BOQ / 3D geometry now exist for all categories incl. S3 (2026-07-09, same
    machinery as S1/S2 — see Module 2's entry).

- **Module 3 — Centuri (ring beams)**. **Citation-confidence note**: before starting this
  module, a dedicated research pass specifically tried OFFICIAL sources (ASRO, MDLPA,
  legislatie.just.ro/Portal Legislativ, cnadnr.ro, INFP) per an explicit user requirement. Every
  official PDF host tried returned HTTP 403 in this project's environment — a systematic block
  (confirmed across many distinct domains and multiple attempts), not a one-off failure. The
  numbers below come from `WebSearch`'s own synthesis of indexed secondary sources, but were
  independently corroborated by **two separate queries converging on identical values** before
  being accepted — higher confidence than a single-source citation, but still not a primary-text
  quote. A structural engineer should confirm against a purchased/official copy of CR6-2013
  before construction use, same as every other seeded structural default in this project.
  - `packages/bim-engine/src/centura.ts` (unit-tested):
    - `deriveCenturaLevels` — one centură per load-bearing wall at its own floor level (CR6-2013:
      "provided in the plane of the walls at all floor levels"), **plus** a second centură
      (reusing the topmost floor's wall footprints) one level above the top floor, for CR6-2013's
      "level above the last residential level, for buildings with non-walkable attics" case. This
      project has no walkable-vs-non-walkable-attic field on `House` yet, so the extra level is
      always generated — the conservative default (an unneeded centură under a walkable attic is
      merely extra, never a missing requirement), consistent with every other "default toward
      more structure, not less" choice in these modules.
    - `deriveCenturaHeightMm`/`deriveCenturaWidthMm` — height = floor-slab thickness for an
      interior wall, **double** that for a perimeter (exterior) wall; width = wall thickness.
      Slab thickness has no field anywhere in this schema yet, so it uses
      `DEFAULT_SLAB_THICKNESS_MM = 130` — the upper (more conservative, since centură height
      scales with it), cited end of STAS 10107/2-92's "12-13cm" typical residential
      monolithic-slab-thickness range. The load/span-specific slab thickness a real floor needs
      is a structural calculation this module does not perform.
    - `deriveCenturaReinforcement` — longitudinal reinforcement ratio 0.5%, realized as bars at
      the cited minimum Ø10mm, bar count derived from the ratio and floored at 4 (2 top + 2
      bottom, the ordinary confining-element arrangement — occasionally more for a deep
      perimeter centură where 4×Ø10 alone would fall under 0.5%). Ø6mm stirrups at ≤150mm.
      Concrete class C12/15 and 25mm cover reuse the same confining-element minimums Module 2
      already cited (CR6-2013 / Normativ 12/2008 Tab. 1; EN 1992-1-1 Table 4.4N XC1) — a bonus
      finding from this module's research directly cross-checked and confirmed Module 2's
      conservative 4×Ø14 tie-column choice (a cited by-seismic-zone table: 1% ratio at ag>0.25,
      0.8% at ag=0.15–0.20, 0.6% at ag=0.10 — 4×Ø14 in a 250×250mm section satisfies all three).
  - New `Centura` model, owned by `House` but tied to the specific `Wall` whose footprint it
    follows (unlike `TieColumn`, a centură has real length/direction, not just a point) — `level`
    distinguishes the wall's own floor from the extra above-top-floor case, so a topmost-floor
    wall gets two `Centura` rows sharing one `wallId`. `ReinforcementSpec` gained `centuraId`
    (widening the polymorphic-parent CHECK to 4 mutually-exclusive parents).
  - `HousesService.getCenturi(houseId)` (`GET /houses/:id/centuri`) auto-provisions per-floor
    placements + reinforcement, idempotent like `getFoundation`/`getTieColumns`. Covered by
    `apps/api/test/centura.e2e-spec.ts` (own-level + above-top-floor placement, exterior-vs-
    interior height doubling, idempotency).
  - UI/BOQ/3D done 2026-07-09 (StructuralPanel section, `calculateStructuralBoq` concrete+steel
    lines, Step 9 instanced prisms + cages). Still not modeled: the wall-set-back width variant
    (250mm when set back for exterior insulation) — only the wall-thickness-matching width.

### Next (not started, planned in order)

- **S3 tie-columns — area+ag branch DONE (Module 2b above)**. Remaining open: (a) a fuller
  cited peak-ground-acceleration-by-locality (ag) table — Module 2b seeds only 4 cross-checked
  cities (`AG_BY_LOCALITY`) and falls back conservatively for the rest, so more cited localities
  would sharpen it without changing behavior; (b) the residual minimum-pier-length trigger (the
  second S3 condition), still with no confirmed primary-source threshold.
- **Module 4 — Frame-column reinforcement (P100-1/2013)** — only relevant once/if a
  non-confined-masonry (frame) house type exists; the project is masonry-only today.
- Concrete cover table completion (NE 012/1-2022 Annex J) for elements beyond the footing/
  tie-column/centură cases above (walls, slabs) — deliberately left open, not guessed. The
  Module 3 research pass confirmed the table lives in NE 012/1-2022 Annex J but could not
  retrieve the actual mm values (official PDF hosts systematically 403 in this environment).
- Monolithic (non-prefabricated) lintel reinforcement — no primary-source citation found yet;
  the prefabricated default (this module's actual output) doesn't need it, but a monolithic
  override path eventually will.
- **Future feature (not started, explicitly deferred by the user until the law-module sequence
  finishes)**: an interactive editor where resizing a structural element (e.g. widening a door)
  correctly re-details the rebar running through/around it — including inserting a lap splice
  when a continuous bar run would exceed standard stock length, and precise corner bends — plus
  the same edits triggerable via natural-language AI chat requests (extending
  `design_update`/`AiService.applyDesignUpdate`). User-confirmed: rebar stock comes in both 6m
  and 12m standard lengths. Splice-length/bend-radius formulas (EN 1992-1-1 §8.3/§8.7,
  SR 438-1) still need their own official-source research pass before implementation.

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

- **Step 7 — opening-aware cut-brick generation**: `generateBrickLayout`/`calculateBrickQuantity`/
  `generateWallBrickInstances` now take an optional `WallOpeningMm[]` (maps 1:1 from the
  `Opening` row: `position` = meters from the wall's start point to the near jamb, `sillHeight` =
  bottom above the wall base — this convention is documented on both the bim-engine type and the
  web store's `Opening`). Coursing rules, all unit-tested against hand-calculated references in
  `masonry-openings.spec.ts`:
  - Courses no opening touches keep the plain global running bond — opening-free walls produce
    **identical** layouts to the pre-step-7 algorithm (regression-tested with `toEqual`).
  - Courses beside an opening are re-anchored FROM the jamb: odd courses start against the jamb
    with a half brick (P2-85 joint-offset bonding), whole modules follow, the leftover cut lands
    away from the opening (far wall end / between two openings). A segment bounded by the wall
    start on its left and a jamb on its right anchors from the right (mirrored).
  - Courses the sill/head line crosses mid-course get height-cut strip pieces filling exactly
    the band below the sill / above the head (lintel soffit), `isCut: true`; pieces under 10mm
    read as mortar, not brick slivers.
  - Cut bricks still render through the same per-instance-scaled pools — each cut piece carries
    its own precise dimensions in its instance matrix (no separate non-instanced mesh needed;
    the darker `instanceColor` tint marks cuts).
  - Threading: `House.openings` added to the web store (the API already returned them);
    `useBrickInstances` puts per-wall openings into worker jobs **and cache keys** (adding an
    opening invalidates only that wall — browser-verified: count dropped 2,438 → 2,418 when a
    window was added live). `WallMesh`'s detail-mode mortar core is decomposed into patches
    around openings (same rectangle subtraction) so holes read as real holes.
  - Cost engine (the promise in the old `costs.service.ts` comment, now fulfilled): BOQ uses net
    wall area (gross − openings) for M2/M3/piecesPerM2 layers and opening-aware
    `calculateBrickQuantity` for the geometric BUC fallback — its `wholeBrickCount` is now
    ceil(run/module) per course-run, so an opening can never *increase* the count. `POST
    /houses/:id/openings` controller route added (the service method existed but was never
    exposed). Covered by a new case in `cost-boq.e2e-spec.ts`.
  - Known limits: overlapping openings on one wall are unsupported (invalid geometry); the
    medium/far abstract wall box still renders solid — only the detail tier and the mortar core
    are opening-aware.

- **Step 8 — longitudinal rebar instancing**: new `packages/bim-engine/src/rebar-instancing.ts`
  (`composeRebarInstanceMatrices`/`generateWallLongitudinalRebarInstances`, unit-tested) turns
  `generateLongitudinalRebarLayout` output into column-major instance matrices over a **unit
  cylinder** (`CylinderGeometry(0.5, 0.5, 1)`, axis Y) — same placement convention as the brick
  instancing. `GET /houses/walls/:id/reinforcement` added with **no auto-provisioning**,
  deliberately: masonry walls carry no rebar and Key rule 7 forbids invented structural
  defaults — `ReinforcementSpec` rows exist only where reinforcement was actually specified
  (seed/DB only for now; no UI creates them yet). `useRebarInstances` computes on the main
  thread (a few bars per wall — no worker needed) and pools per floor; `RebarInstances` renders
  steel-gray Lambert cylinders, LOD-gated at `detail` like bricks. A wall that has bars but no
  brick detail renders its abstract box translucent (the usual BIM reinforcement-view
  convention) so the bars read. Overlay gained `viewer3d.rebarCountLabel` (all 3 locales).
  Browser-verified on a seeded C25/30 wall (Ø12 @ 150mm, 25mm cover — SR 438-1-range values):
  overlay reports the 2 computed bars, wall translucency confirmed visually.

- **Step 9 — stirrup/bent rebar + confining-element 3D geometry (done 2026-07-09)**:
  `packages/bim-engine/src/structural-rebar.ts` (unit-tested): closed stirrup loops rendered as
  4 centerline segments over the SAME unit-cylinder instancing convention as step 8 (no new
  geometry type in the viewer) — `calculateStirrupQuantity`/`generateStirrupPositionsMm` (even
  spacing so no gap exceeds the spec value, mirroring `detectMidSpanTieColumns`' conservative
  stance; loop length is the centerline perimeter and explicitly EXCLUDES the end-hook/anchorage
  allowance, which has no cited primary source — documented, not guessed), full tie-column cages
  (`generateColumnRebarSegments`: 4 corner bars + horizontal loops), centură bars + vertical
  loops (`generateRunLongitudinalSegments` — 2 bottom + 2 top rows, extras distributed evenly,
  a rendering arrangement, not a cited bar schedule — and `generateRunStirrupSegments`), plus
  world-space segment/box matrix composers (`composeSegmentInstanceMatrices`/
  `composeWorldBoxMatrices`). In `apps/web`: `useStructuralInstances` fetches the
  auto-provisioned tie-columns/centuri and pools translucent concrete boxes + steel cages per
  floor at the `detail` LOD tier (`StructuralConcrete.tsx`); `useRebarInstances` now also renders
  wall `STIRRUP` specs as loops; the overlay gained stirrup/tie-column/centură counts (i18n'd).
  Browser-verified on the seeded 10×8 house: 5,088 bricks + 843 stirrups, 13 stâlpișori, 10
  centuri rendering together at detail tier.

Full original architecture writeup (context, source table, detailed rationale per step) lived
in a session plan file outside this repo and did not persist — the above is the durable
reference going forward. Keep this section updated as Steps 5–9 land.

## Spec documents
All 13 PDFs in `docs/materials/` are the source of truth.
Never add functionality not described there.
