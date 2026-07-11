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
10. **Every completed task ships as a merged PR + a durable CLAUDE.md note.** Standing user
    rule (2026-07-09): when a task is finished — implementation + tests green — the flow is
    (a) commit on the working branch, (b) open a PR against `main` with a summary and test
    plan (use `mcp__github__create_pull_request`), (c) merge it (`mcp__github__merge_pull_request`,
    squash), (d) write a short entry in CLAUDE.md describing what shipped (add to the relevant
    "Done"/"AI rooms → …" style section or create a new one), so the durable reference stays
    current. No task is "done" until all four have happened. Don't wait to be asked for the
    PR / merge / note — do them as part of finishing the task.

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

### AI rooms → coherent floor-plan + auto-openings + roof (added 2026-07-09)

Before this change, an AI-designed house looked like disconnected rectangles in a row plus a
few more stacked on top — a real user complaint: "the system doesn't build a house, just
boxes next to and on top of each other." Confirmed against the code: every room got a 1.3:1
placeholder rectangle (`ROOM_ASPECT_RATIO` in `design-update-mapper.ts`) placed to the right
of the previous one (`nextRoomPosition`), there was no roof at all (`House.roofType` was a
label with no geometry), and no doors/windows anywhere. Three new modules close all three
gaps together — an AI-designed house now reads as an actual house in 2D and 3D.

- **Floor-plan solver**: `packages/bim-engine/src/floor-plan.ts` (unit-tested). Functional-
  zone-aware slice-and-dice partition, per **NP 057-2002** (Normativ privind proiectarea
  clădirilor de locuinţe, MLPTL Order 1383/24.09.2002 — the RO residential-design normativ
  that explicitly addresses "Orientarea față de punctele cardinale"). Rooms are grouped into
  PUBLIC / PRIVATE / SERVICE / CIRCULATION / EXTERIOR zones by case-insensitive keyword match
  against a small RO/EN/HU keyword list (`classifyRoomZone`); PUBLIC sits on the +Y strip
  (south/sunny facade preference), PRIVATE on -Y, SERVICE tucked interior. Per-floor envelope
  aspect `TARGET_ENVELOPE_ASPECT = 1.4:1` (widely-cited residential proportion, not a normativ
  figure — flagged as such in the module comment). Each floor solves its own envelope from its
  own indoor room area, so an upper floor whose area ≤ the ground floor's produces a strictly
  smaller envelope that sits inside the ground footprint at (0,0) — no cantilever/overhang,
  which would need its own structural design. Slice-and-dice orders rooms area-descending and
  splits along the longer axis each step (children stay close to square). An explicit
  CORRIDOR room becomes a spine strip at least **MIN_CORRIDOR_WIDTH_M** (0.9 m, matching
  `RulesService.minCorridorWidth`) wide. Deterministic — same input, byte-for-byte same output.
  Solver does **not** create new Room DB rows (won't invent a corridor the AI didn't ask for);
  it only positions rooms that already exist. **Citation-confidence note**: NP 057-2002's
  specific per-room orientation table (which room faces which cardinal direction) could not be
  extracted here — the official MDLPA PDF host systematically 403s in this environment, same
  block that hit every prior law-module research pass. The zone grouping mirrors the widely-
  cited RO architectural convention aligned with the normativ; the per-orientation table is a
  follow-up citation gap, not a specification error.

- **Openings-generation**: `packages/bim-engine/src/openings-generation.ts` (unit-tested).
  Given the solved rooms + the walls `deriveWallsFromRooms` generates around them, emits three
  kinds of openings:
  - **Interior doors** — one per pair of rooms sharing an interior wall, centered on the
    shared segment. Width per **RulesService.minDoorWidth** (matching C 253/8-1994 practice):
    0.8 m internal, 0.7 m into a bathroom. Height 2.1 m, sillHeight 0. Both jambs sit
    ≥`DOOR_JAMB_CLEAR_M` (0.25 m = `TIE_COLUMN_CROSS_SECTION_MM`) off the wall ends, so the
    door doesn't collide with an S1 corner tie-column (CR6-2013 — see confined-masonry.ts).
  - **Exterior windows** — sized to satisfy **Ordinul MS 119/2014** ("Norme de igienă
    referitoare la zonele de locuit") natural-light requirement, using the commonly-cited 1/8
    window-to-floor ratio (the 1/6…1/10 optimum range widely quoted for RO residential design).
    Target area per room is split across whatever exterior wall segments that room borders,
    ranked by facade preference (+Y "south" strongest). Widths snap to a common residential
    module (0.6/0.9/1.2/1.5/1.8/2.4 m). Sill height 0.9 m default (residential parapet);
    1.4 m in bathrooms/kitchens for privacy.
  - **Entry door** — exactly one per house, on the ground-floor entry room (HALL/ENTRY if
    present, else LIVING_ROOM, else the largest public-zone room), on its most-public exterior
    facade. Width 0.9 m (`RulesService.minDoorWidth.entrance`).
  Written only against **generated** walls (isGenerated=true); user-drawn walls and their
  user-drawn openings are untouched. A wall shorter than the smallest door + 2 × jamb clear
  (a legit tight corner) correctly receives no opening.

- **Roof model + geometry**: `packages/bim-engine/src/roof.ts` (unit-tested) — pure spec calc
  (pitch/overhang/ridge-height derivation). New Prisma `Roof` model + `RoofType` enum (GABLED
  / HIPPED / FLAT / MONOSLOPE) via migration `add_roof`, plus a `ROOFING` value on
  `MaterialCategory`. One `Roof` per house (unique on `houseId`), 1:1 with `House` via the new
  `House.roof?` relation. `materialId` FK → a `MaterialCategory.ROOFING` seeded default:
  `Țiglă ceramică Tondach standard` (Wienerberger RO / Tondach product line — SR EN 1304).
  **Citations** (secondary-source corroborated, same confidence bar as the law-modules —
  official STAS/normativ PDF hosts systematically 403 in this environment):
  - **Default pitch 35°** — mid of the practical 30°–45° residential range, safely above every
    Tondach standard-profile minimum (30° with continuous sheathing, cross-checked across two
    manufacturer/technical-press sources). **NP 057-2002** explicitly names 30° as the snow-
    retention threshold ("la acoperișurile cu pantă mai mare de 30° se vor prevedea opritoare
    de zăpadă"), so anything above triggers snow-stop requirement — 35° is deliberately above
    it so we don't hide the requirement in a marginal case. `pitchVerified: true`.
  - **Default overhang 0.7 m** (streașină) — widely-cited RO residential convention (protects
    facade from driving rain, plaster from snow melt). Not a normativ figure —
    `overhangVerified: false`, surfaced the same way `specSheet.priceVerified: false` is.
  - `deriveRidgeHeight`: symmetric roof over the footprint, ridge above center, height
    `(shorter_span/2) · tan(pitch)`. Flat roof: 0 rise.

- **`HousesService.solveAndRegenerate(houseId, userId)`** — the new orchestration entry
  point. In one interactive transaction it (1) re-solves every room's position, (2) persists
  posX/posY/width/area back to the Room rows, (3) deletes and recreates the generated walls,
  (4) generates a fresh opening set on the new walls, then (5) auto-provisions / refreshes the
  `Roof` row's ridge from the new topmost-floor footprint. Layer stacks / reinforcement /
  lintels / tie-columns / centuri cascade with their parent walls and re-provision lazily on
  next read — no extra wiring. This replaces every prior `regenerateGeneratedWalls` call from
  the AI flow (`AiService.applyDesignUpdate`, `AiService.rebuildFromConversation`,
  `HousesService.removeRoom`); the primitive is only kept for callers that specifically want
  a wall-only pass. `nextRoomPosition` from `design-update-mapper.ts` is no longer used by
  the AI flow — the export is left in place to avoid touching call-sites elsewhere.

- **3D**: new `GET /houses/:id/roof` endpoint; new `apps/web/src/components/viewer3d/
  RoofMesh.tsx` renders a symmetric gable (BufferGeometry with 6 vertices / 6 triangles —
  2 slopes × 2 tris + 2 gable tris) plus 4 soffit strips under the overhang, wired in from
  `HouseScene`. FLAT/MONOSLOPE fall back to a thin cap for now — a placeholder so the roof
  doesn't disappear, real per-type geometry can ship later without touching the callsite.
  Ridge runs along the footprint's longer side (RO residential convention). `WallMesh`'s
  abstract-box mode now decomposes into patches with holes at every LOD tier (not just the
  detail mortar-core mode), so doors and windows show up from first paint instead of reading
  as a sealed brick block until the user zooms in.

Manual "Adaugă perete" is now wired: two clicks on `FloorPlanCanvas` in `editorMode ==
'add-wall'` capture a world-space start + end and POST to `/houses/:id/walls` (interior default,
`floor = activeFloor`); a dashed Konva preview line runs from the captured start to the current
cursor, and a small i18n'd hint above the canvas tracks first-click vs second-click state
(`editor.addWallHintFirstClick` / `editor.addWallHintSecondClick`, all 3 locales). On success
the house + cost-estimate queries are invalidated and the editor drops back to `select` mode.
Still open: the AI's `ADD_WALL` action remains unhandled (never observed to carry usable
geometry); regenerating still drops openings that were manually added to a *generated* wall
(they cascade with the wall row — put openings on manual walls, or re-add them once the room
plan settles).
Interactive `RoofPanel.tsx` (type dropdown + pitch/overhang inputs) is wired to the new
`PATCH /houses/:id/roof` endpoint (`HousesService.updateRoof` recomputes ridgeHeightM off
the current footprint on pitch change). Cost-engine BOQ now emits a `Țiglă ceramică Tondach
standard` line from the topmost-floor exterior footprint + `overhangM` × `1/cos(pitch)` —
`overhangVerified` / `pitchVerified` flow onto the `CostItem.verified` + `notes` fields so
the UI can surface an "unverified overhang" the same way `Material.specSheet.priceVerified`
is surfaced (`costs.service.ts`'s `calculateRoofBoq`). Every RoofType now has real
per-type geometry in `RoofMesh.tsx`: HIPPED renders two trapezoidal main slopes + two
triangular hip slopes converging on a shorter ridge (`long - short`, via the new
`deriveHippedRidgeLength` in `packages/bim-engine/src/roof.ts`; a square footprint
collapses smoothly to a 4-triangle pyramid); FLAT is an honest slab (`BoxGeometry` sitting
on the walls with overhang extended, replacing the thin-cap placeholder); MONOSLOPE is a
single sloped plane whose rise = `shortSide · tan(pitch)` (the full span, not half —
matching the new `deriveMonoslopeRise` helper). GABLED is byte-identical to the prior
6-vertex geometry. `deriveRidgeHeight` now routes MONOSLOPE through the full-span helper
so the persisted `ridgeHeightM` reflects the real vertical extent of a monoslope roof.
NP 057-2002's per-room orientation table (which specific room prefers which cardinal
direction) still uncited — the current zoning uses the widely-cited convention aligned
with the normativ, not the extracted table.

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
  - UI panel: `apps/web/src/components/editor/FoundationPanel.tsx` shows depth (+
    `depthVerified` badge), width, concrete class, the assembly layers, and the two
    reinforcement mats. Triggered from the `EditorToolbar` "Fundație" button; read-only for now.
  - Cost engine BOQ: `costs.service.ts`'s `calculateFoundationBoq` now emits real per-material
    lines from the auto-provisioned Foundation row and the ground-floor load-bearing wall
    perimeter — `Beton de egalizare C8/10` m³ (lean layer), `Beton C16/20` m³ (structural
    strip footing), and `Oțel beton B500C` kg for both the TRANSVERSE (resistance) and
    LONGITUDINAL (distribution) mats via `calculateLongitudinalRebarQuantity` (transverse mat
    computed with axes swapped so the composer's barCount becomes the number of transverse
    bars along the perimeter). The flat `structure: 800 RON/m²` line is dropped once these
    materialize; it falls back when the house has no ground-floor load-bearing walls yet.

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
  - UI panels: `TieColumnsPanel.tsx` (S1/S2/S3 category badge, floor, cross-section, concrete
    class, LONGITUDINAL barCount/diameter + STIRRUP diameter/spacing) and `LintelPanel.tsx`
    (shown when an opening is selected — material, length, width, bearing length, prefabricated
    flag). Both read-only, triggered from the toolbar's "Stâlpișori" button and the opening
    selection respectively.
  - Cost engine BOQ: `costs.service.ts`'s `calculateStructuralBoq` aggregates every S1/S2/S3
    tie-column into one `Beton C12/15` m³ line (0.25 × 0.25 × storey height per column, storey
    height read from the same-floor walls with a 2.7 m fallback) plus per-diameter
    `Oțel beton B500C` kg lines for LONGITUDINAL (4-corner-bar count × storey height) and
    STIRRUP (via `calculateStirrupQuantity`). `calculateLintelBoq` emits one
    `Buiandrug prefabricat` BUC line per Opening on the house (does NOT create Lintel rows —
    a read-only cost pass shouldn't mutate structural data). 3D-viewer geometry: the
    concrete column body ships as `apps/web/src/components/viewer3d/TieColumnInstances.tsx`
    (+ `useTieColumnInstances.ts`), one `InstancedMesh` per floor pool over a unit box
    scaled to `crossSectionMm × storeyHeight × crossSectionMm` — a solid concrete-gray
    column at (posX, floor·LEVEL_HEIGHT_M, posY), rendered at every LOD tier (cheap solid
    box), so the S1/S2/S3 placements the API auto-provisions are now visually present in
    the 3D view alongside the Step 9 stirrups inside them. LONGITUDINAL corner-bar
    instancing for the tie-column's 4-fixed rebar (currently only wall LONGITUDINAL
    instances ship) is still a follow-up.

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
  - Not yet done: the residual-pier-length S3 trigger (no confirmed threshold — still a gap); no
    UI panel / cost BOQ line / 3D geometry for S3 (same as S1/S2).

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
  - UI panel: `CenturiPanel.tsx` (wallId, level, heightMm, widthMm, concrete class,
    LONGITUDINAL + STIRRUP specs) triggered from the toolbar's "Centuri" button. Read-only.
  - Cost engine BOQ: `costs.service.ts`'s `calculateStructuralBoq` aggregates every centura
    (one per wall × its own floor + one at the above-top-floor level) into one `Beton C12/15`
    m³ line (widthMm × heightMm × wall length per row) plus per-diameter `Oțel beton B500C`
    kg lines for LONGITUDINAL (barCount × wall length) and STIRRUP (via
    `calculateStirrupQuantity`). 3D-viewer geometry: the concrete beam body ships as
    `apps/web/src/components/viewer3d/CenturaInstances.tsx` (+ `useCenturaInstances.ts`),
    one `InstancedMesh` per centura level pool over a unit box scaled to
    `wallLengthM × heightMm/1000 × widthMm/1000` and rotated to match its host wall's
    axis (`WallMesh`'s `rotationY = -atan2(dz, dx)` convention). Each beam sits with its
    top face at the top of its wall run (`wall.height - heightMm/1000` below the pool
    baseline in the pool's local frame; the pool's level·LEVEL_HEIGHT_M lift puts the
    beam top at (level+1)·LEVEL_HEIGHT_M in absolute coords). The extra above-top-floor
    centura groups into its own pool by `level`, so it lifts one storey higher than its
    host wall — matching how the API auto-provisions it. Same concrete-gray Lambert as
    tie-columns. Still not modeled: the wall-set-back width variant (250mm when set back
    for exterior insulation) — only the wall-thickness-matching width ships.

### Next (not started, planned in order)

- **S3 tie-columns — area+ag branch DONE (Module 2b above)**. `AG_BY_LOCALITY` expansion pass
  (2026-07-10, PR #47) grew the cited coverage from 4 to **7 cross-checked cities** — Timișoara
  0.20g (two academic Timișoara-vulnerability case studies), Constanța 0.20g (OAR 2022 park-
  concurs doc + Dlubal reference), Ploiești 0.35g (Observatorul Prahovean's stated 0.35
  seismic-indicator + Fanatik risk summary + Encipedia PGA range) joined the original
  București / Iași / Focșani-Vrancea / Cluj-Napoca set. Every added entry carries an inline
  citation to its two independently-phrased secondary sources. Remaining ungathered under this
  pass (documented in the seismic.ts module doc comment): Brașov, Craiova, Bacău, Buzău,
  Galați, Brăila, Sibiu, Sfântu Gheorghe, Suceava, Târgu Mureș, Oradea, Arad, Baia Mare,
  Botoșani — all described in prose as "middle range" / "high hazard" without converging on a
  specific 0.05g P100-1/2013 bucket in any two sources tried (Dlubal, Encipedia, Fanatik,
  MDPI, arXiv, ResearchGate); the official MDLPA interactive map + Encipedia's PDF host
  systematically 403 in this environment. The conservative fallback (`FALLBACK_AG_G` =
  0.25g, `verified: false`) still applies for every unlisted locality, so behavior for those
  is unchanged. Still open: (b) the residual minimum-pier-length S3 trigger — still with no
  confirmed primary-source threshold.
- **Module 4 — Frame-column reinforcement (P100-1/2013)** — only relevant once/if a
  non-confined-masonry (frame) house type exists; the project is masonry-only today.
- **Concrete cover table completion (NE 012/1-2022 Annex J) — partial DONE (2026-07-10, PR
  #47)**. Wall + slab covers for the ordinary residential exposure cases now shipped as
  named constants in `foundation.ts` next to the pre-existing `STRIP_FOOTING_COVER_MM = 40`:
  `WALL_COVER_MM_XC1 = 25` and `SLAB_COVER_MM_XC1 = 25` (interior dry — 15 mm cmin,dur + 10 mm
  Δcdev = 25 mm nominal, matching `TIE_COLUMN_COVER_MM`), `WALL_COVER_MM_XC2 = 35` and
  `SLAB_COVER_MM_XC3 = 35` (cyclic-wet / exterior — 25 mm cmin,dur + 10 mm Δcdev). Values are
  the EN 1992-1-1 Table 4.4N structural-class-S4 recommended figures, cross-checked in the
  Cyprus National Annex + eurocodeapplied.com's cover calculator + Dlubal RF-CONCRETE
  Members KB (identical values across three secondary sources; the official NE 012/1-2022
  Annex J PDF systematically 403s in this environment, same block that hit every prior
  module). **Nothing consumes these yet** — they exist for the future wall/slab
  reinforcement modules to reuse without another research pass. Explicit `TODO(cover-table)`
  gaps left in the code: XC4 (cyclic wet-dry, e.g. a slab under a rain-exposed floor —
  likely 40 mm nominal, only one clean corroborating source found), XD/XS/XA
  chloride/chemical classes (out of scope for ordinary residential today), and RO NA
  confirmation of Δcdev = 10 mm (the recommended EN value the NA is reported not to
  deviate from, but not directly citable from this environment).
- **Monolithic (non-prefabricated) lintel reinforcement — DONE (2026-07-10, PR #47)**. The
  "no primary-source citation" gap this bullet used to describe is now closed at the same
  two-source-secondary bar every other law-module uses. New helpers in
  `packages/bim-engine/src/confined-masonry.ts` next to `deriveLintelSpec`:
  `deriveMonolithicLintelReinforcement` (`{ longitudinal: { barCount: 4, diameterMm: 12,
  coverMm: 25 }, stirrup: { diameterMm: 6, spacingMm: 150, coverMm: 25 }, concreteClass:
  'C16/20' }`), `deriveMonolithicLintelHeightMm` (`h ≥ L/5`, floored at 200 mm — matching
  Encipedia's "for an opening of ~1.00m, h > 20cm" example), `deriveMonolithicLintelSpec`
  (same shape as `deriveLintelSpec` with 400 mm bearing each side + `prefabricated: false`).
  **Citations** (two independently-phrased searches converging on identical figures):
  - Bar Ø12 mm minimum — Encipedia's CR2-1-1-1/2013 "Prevederi constructive" article
    cross-checked in casasidesign.ro's minimum-reinforcement-diameters guide.
  - 2 top + 2 bottom bars (4 total) — Encipedia + colegiu-diriginti-santier.ro's zidărie-
    confinată design guidance ("cu 2 bare cu diametru minim 12mm" per side).
  - Concrete class C16/20 — Encipedia (recommended for buiandrug monolit) + colegiu-
    diriginti-santier.ro's zidărie-confinată article (same class).
  - Minimum depth h ≥ L/5 — colegiu-diriginti-santier.ro + forum.misiuneacasa.ro (same
    "old-standard masonry rule" repeated identically).
  - Bearing 400 mm — colegiu-diriginti-santier.ro cross-checked in the Wienerberger
    Porotherm technical brief (which cites 40 cm for monolithic and separately 25 cm for
    its A12 prefabricated product — two different cases, both consistent).
  - **Stirrup Ø6 @ 150 mm NOT independently cross-checked for monolithic lintels
    specifically**. Value inherited from CR6-2013 confining-element practice
    (`TIE_COLUMN_STIRRUP_*` / `centura.ts` — same Ø6@150), which is the correct fallback
    since a monolithic lintel is often cast integral with the centură and shares its
    stirrup detailing (Encipedia's "possibly tied to the ceiling's confining element" note).
    Flagged in the code's citation-confidence block for engineer confirmation. The load-
    derived shear-reinforcement calc per SR EN 1992-1-1 §9.2.2 remains deliberately out of
    scope, same as everywhere else in the law-modules.
  Not yet done: no caller uses these helpers yet — `Lintel.prefabricated: true` remains the
  auto-provisioned default from `HousesService.getLintel`. A UI toggle / project-setting
  override that flips a specific Lintel to monolithic (calling the new helpers instead of
  `deriveLintelSpec`) is the next natural step but out of scope for this data-widening PR.
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

- **Step 9 — Stirrup / kengyer / etriers instancing**: the bent closed-loop transverse
  reinforcement for the confining elements Modules 2/3 already ship — the last of the
  BIM-detail sequence. At the `detail` LOD tier the 3D viewer now draws stirrups alongside
  the longitudinal bars (Step 8) and brick coursing (Steps 6/7). Every number comes from the
  STIRRUP-role `ReinforcementSpec` rows already seeded by CR6-2013 Modules 2 (tie-columns:
  Ø6 @ 150mm, 25mm cover) and 3 (centuri: same); no invented structural defaults.
  - `packages/bim-engine/src/stirrup.ts` (unit-tested): pure element-agnostic layout —
    `generateStirrupLayout(element, spec)` returns one `StirrupLoop` per stirrup, positioned
    at `spec.coverMm + i * spec.spacingMm` from the near end, with cross-section half-extents
    `crossSection/2 - cover - Ø/2` on each axis. `calculateStirrupCount` and
    `calculateStirrupQuantity` (perimeter × loop count, weight from steel density) for the
    cost-engine side. **Not modeled** (deliberately, no primary citation for either): CR6-
    2013's tighter end-zone stirrup spacing (a per-drawing detailing refinement) and hook /
    overlap length per SR EN 1992-1-1 §8.5 — flagged in the module doc as gaps.
  - `packages/bim-engine/src/stirrup-instancing.ts` (unit-tested):
    `composeStirrupInstanceMatrices(frame, loops)` emits 4 world-space matrices per loop (the
    4 sides of the rectangular stirrup, drawn edge-to-edge as straight bar segments — no
    curved torus geometry) over the same unit cylinder `rebar-instancing.ts` uses. Two
    convenience wrappers pick the frame automatically:
    `generateTieColumnStirrupInstances` (vertical column at plan (posX, posZ), Y up) and
    `generateCenturaStirrupInstances` (horizontal ring beam along a wall, longAxis = wall
    direction, one cross axis vertical, the other across wall thickness).
  - Web: `apps/web/src/components/viewer3d/useStirrupInstances.ts` fetches every tie-column
    + centură via the existing `GET /houses/:id/tie-columns` and `GET /houses/:id/centuri`
    endpoints (their responses already include the `STIRRUP`-role reinforcement rows) and
    composes matrices on the main thread — the total loop count for an ordinary house is in
    the low hundreds, well below the worker threshold the brick path needs. Pools by floor,
    same layout as the rebar pools; centuri key by `level` so the extra above-top-floor
    centură renders one storey higher than its host wall. `StirrupInstances.tsx` renders one
    `InstancedMesh` per pool in a slightly-lighter steel gray than the longitudinal bars (so
    a close-up mixed view stays legible). `HouseScene` wires it in under the existing rebar
    LOD-gate; a new `viewer3d.stirrupCountLabel` overlay counter joins the bricks/bars
    counters (all 3 locales — etrieri / kengyerek / stirrups).
  - Coverage: 8 new unit tests in `stirrup.spec.ts` / `stirrup-instancing.spec.ts` (loop
    count, half-extent math for tie-column and centură cross-sections, empty layouts for
    too-thin cross-sections and cover-buried elements, perimeter/weight quantity, non-
    STIRRUP-role and zero-length early-outs, unit-cylinder matrix scale/orientation on both
    vertical and horizontal orientations). 2 new API e2e cases in
    `apps/api/test/stirrup.e2e-spec.ts` end-to-end: `GET /houses/:id/tie-columns` returns
    the STIRRUP spec → composer produces 4 segments × 18 loops (2.7m storey) per S1 column,
    and `GET /houses/:id/centuri` drives the horizontal 5m-centura layout to 34 loops × 4
    segments.
  - The STIRRUP row is now surfaced in the `TieColumnsPanel` and `CenturiPanel` alongside the
    LONGITUDINAL row (see the confined-masonry / centura entries above); the `WallLayerPanel`
    is now a two-tab inspector — the existing layer stack + a new "Vasalare" / "Vasalás" /
    "Reinforcement" tab reading `GET /houses/walls/:id/reinforcement`, so any wall that carries
    a reinforcement spec (LONGITUDINAL / STIRRUP / TRANSVERSE) has it visible in the editor.
    Empty state (the norm for plain masonry) is the deliberate Key rule 7 outcome — no auto-
    provisioned rebar. The `FoundationPanel` already surfaces the strip footing's TRANSVERSE +
    LONGITUDINAL mats, so every element that carries reinforcement in the DB now has a UI view.
    Cost engine BOQ: `costs.service.ts`'s
    `calculateStructuralBoq` now feeds each tie-column's and centura's STIRRUP spec into
    `calculateStirrupQuantity` alongside `calculateLongitudinalRebarQuantity` for the
    LONGITUDINAL bars, aggregated per-diameter into `Oțel beton B500C` kg lines. This closes
    the "the calc is ready, the caller in `costs.service.ts` is not" gap this note used to
    document.

### Next

- Reinforcement panel UI for foundations, tie-columns, centuri and user-reinforced walls
  shipped: `FoundationPanel` shows the strip footing's TRANSVERSE + LONGITUDINAL mats,
  `TieColumnsPanel` and `CenturiPanel` show LONGITUDINAL + STIRRUP inline, and the two-tab
  `WallLayerPanel` reads `GET /houses/walls/:id/reinforcement` for any user-reinforced wall
  (empty state on plain masonry is the Key rule 7 outcome).
- Cost-engine BOQ for structural rebar + foundation + tie-columns + centuri + lintels + roof
  shipped in `costs.service.ts` — see the per-module "Cost engine BOQ:" bullets on
  Foundation / Module 2 / Module 3 / roof + Step 9 above, and
  `apps/api/test/cost-boq.e2e-spec.ts` for coverage. The editor now surfaces those lines
  via `apps/web/src/components/editor/CostBoqPanel.tsx` — a right-side inspector triggered
  from the new "Deviz" / "Költségvetés" / "Cost BOQ" toolbar button (extending the
  structural-panel union with `'cost-boq'`). It groups every real BOQ line by category
  (foundation / walls / tie-columns / centuri / lintels / roof / other), shows material,
  standard ref, quantity + unit, unit price and line total, sums a grand total in the
  returned currency, and marks any `verified: false` / `priceVerified: false` line with an
  amber "Neconfirmat" / "Nem ellenőrzött" / "Unverified" chip (mirroring `WallLayerPanel`'s
  unverified-price disclosure). Data comes from `GET /costs/projects/:id/estimate` — the
  new ownership-checked read (`ProjectsService.assertOwnership`, same pattern as the AI /
  houses controllers), covered by an auth+ownership+happy-path e2e case in
  `apps/api/test/cost-boq.e2e-spec.ts`. Follow-ups still open: MEP / finishes / interior
  doors / windows carpentry (still flat area-rates); LONGITUDINAL corner-bar instancing for
  the tie-column's 4 fixed bars is still not modeled — only wall LONGITUDINAL bars have
  viewer instances so far. (The other two follow-ups this bullet used to document — a real
  hipped-roof geometry distinct from GABLED, and 3D-viewer concrete-shell geometry for the
  tie-columns / centuri themselves — shipped: HIPPED / FLAT / MONOSLOPE each have real
  per-type geometry in `RoofMesh.tsx`, and `TieColumnInstances` / `CenturaInstances` render
  the concrete bodies at every LOD tier alongside the Step 9 stirrups.)

- **Labor cost (manoperă) + TVA 19% in cost BOQ (2026-07-11, PR #50)**. The cost estimate
  now contains three sections beyond raw material lines: a labor section, a tax section, and
  an extended summary.
  - **Labor lines**: 8 categories, all `priceVerified: false` (no official Romanian labor-cost
    index — Bursa Construcțiilor 2024 used as a non-official reference, same stance as material
    prices): foundation excavation/formwork/pour 350 RON/m², masonry 280, interior plaster 80,
    thermal insulation 60, painting 35, roofing 200, structural concrete (tie-columns/centuri/
    lintels) 400, carpentry (windows/doors) 150. Quantities are geometric proxies from the
    house model — footing perimeter × footing width for foundation labor, gross wall area per
    trade for plaster/paint/insulation, exterior wall area × 1/cos(pitch) for roofing, number
    of structural elements × storey height for structural labor, opening count × unit height for
    carpentry. Zero-quantity lines are filtered out automatically.
  - **TVA 19%** (Legea 227/2015): one `tax` category line applied to `subtotalMaterials +
    subtotalLabor`. A localized note (`vatNote`, all 3 locales) explains that the 5% reduced
    rate may apply under Codul Fiscal art. 291 if price ≤ 600,000 RON and usable area ≤ 120 m².
    `priceVerified: false` to match the unverified nature of the underlying subtotals.
  - **Extended `CostEstimateResponse`**: `subtotalMaterials` / `subtotalLabor` / `vatAmount` /
    `grandTotal` (= materials + labor + VAT); `total` kept as an alias for backward
    compatibility. The DB `CostEstimate.total` column now stores the `grandTotal`.
  - **`CostBoqPanel.tsx`** rewritten with three ordered sections — Materials (existing grouped-
    by-category rendering) → Labor → Tax — each with its own subtotal row, plus a 4-row footer
    (materials subtotal / labor subtotal / VAT / grand total bold). Shared `BoqLineCard`
    sub-component extracted for materials and labor lines; Tax gets a custom card that shows
    `vatAmount` + the `vatNote` amber disclaimer paragraph.
  - **i18n**: 6 new keys in `Dictionary` and all 3 locale files: `subtotalMaterials`,
    `subtotalLabor`, `laborSection`, `taxSection`, `vatRate`, `vatNote`. TS enforces all three
    files stay in sync — missing key = compile error.
  - **E2E**: `cost-boq.e2e-spec.ts` gained a new test asserting all new response fields are
    present and positive, `grandTotal ≈ subtotalMaterials + subtotalLabor + vatAmount` (±0.01),
    `vatAmount ≈ (materials + labor) × 0.19`, labor lines carry `priceVerified: false`, tax
    line is named `TVA 19%`.

- **Lépcső / Scară (Staircase) BIM element (2026-07-11, PR #52)**. A full staircase element
  following the exact same pattern as Foundation, TieColumn, and Centura — pure bim-engine
  calc + Prisma model + manual migration + REST API + i18n + editor panel + 3D mesh.
  - **`packages/bim-engine/src/stairs.ts`** (unit-tested): `deriveStaircaseSpec()` derives
    riser count, riser height, tread depth, horizontal run, and Blondel check from a floor-
    to-floor height. Algorithm: `riserCount = ceil(H / MAX_RISER_MM)` so no single riser
    exceeds the code maximum; tread from Blondel formula `T = 630 - 2R`. Violations recorded
    when tread < 250mm or width < 900mm.
    **Citations** (secondary-corroborated, same bar as all other law modules):
    - `MAX_RISER_MM = 200` — NP 057-2002 §5.6 (max residential riser). Secondary-corroborated
      via encipedia.ro NP 057-2002 summary + multiple RO residential design guides.
    - `MIN_TREAD_MM = 250` — NP 057-2002 §5.6 ("going" min tread). Same sources.
    - `MIN_CLEAR_WIDTH_MM = 900` — STAS 2965-86 §3.1 / NP 057-2002 §5.6. Secondary-
      corroborated via encipedia.ro + multiple RO residential design references.
    - `BLONDEL_TARGET_MM = 630` — François Blondel (1675) formula, widely cited as the
      residential comfort optimum in RO architectural textbooks + casasidesign.ro.
    - Official STAS 2965-86 / NP 057-2002 PDFs systematically 403 in this environment (same
      block as every prior law-module pass). All values secondary-corroborated; engineer
      confirmation before construction use.
  - **Prisma**: `Staircase` model on `House` (CASCADE delete, `houseId` index). Manual
    migration `20260711120000_add_staircase`. Fields: floor, posX/posY, widthM, lengthM,
    riserCount, riserHeightMm, treadDepthMm, handedness, isGenerated.
  - **API**: `GET/POST/DELETE /houses/:id/staircases`, `DELETE /houses/:id/staircases/:id`.
    **No auto-provisioning** — a single-storey house needs no staircase; the API never creates
    one silently (unlike Foundation/TieColumns/Centuri). `createStaircase` calls
    `deriveStaircaseSpec` and persists the derived geometry.
  - **i18n**: `toolStaircase` + full `structuralInspector.staircase` section (title, empty,
    addButton, floor, width, length, riserCount, riserHeight, treadDepth, horizontalRun,
    blondelCheck, blondelTarget, handedness, handednessRight, handednessLeft, codeCompliant,
    codeViolation, loading, deleteButton) in all 3 locale files. TypeScript enforces
    completeness via `satisfies Dictionary`.
  - **Editor UI**: `StaircasePanel.tsx` lists every staircase row with Blondel check (green/
    red badge against 630mm target), riser/tread/width values, code-compliance badge
    (NP 057-2002, red/green), handedness label, per-item delete, and an "add staircase" button
    shown only for multi-storey houses. Wired into `EditorToolbar` (new
    "Scară/Lépcső/Staircase" button, extending `StructuralPanel` union with `'staircase'`)
    and `EditorLayout` (`panelTitle` + `renderRightPanel`).
  - **3D viewer**: `StaircaseMesh.tsx` renders a staircase as stepped box slices — one
    `BoxGeometry` per riser/tread pair, building the classic stair profile in +Y/+Z. Wired
    into `HouseScene` via `useStaircases(house.id)`, positioned at `floorElevation(s.floor)`.
  - **Hooks**: `StaircaseRow`, `useStaircases`, `useCreateStaircase`, `useDeleteStaircase`
    in `useProjects.ts`.
  - **E2E**: `apps/api/test/stairs.e2e-spec.ts` — 5 cases: empty list, geometry check for
    3000mm floor (n=15, riser=200mm, tread=230mm), custom width, delete, multi-floor list.

Full original architecture writeup (context, source table, detailed rationale per step) lived
in a session plan file outside this repo and did not persist — the above is the durable
reference going forward. Keep this section updated as Steps 5–9 land.

## Project collaboration (2026-07-11, PR #54)

Role-based multi-user access on top of the previously single-owner project model.

- **Data model**: `ProjectMember` (Prisma) — `projectId` + `userId` + `ProjectMemberRole` (OWNER / EDITOR /
  VIEWER) + `invitedBy` + `invitedAt` + `acceptedAt` (null = pending). Unique index on
  `(projectId, userId)`. Manual migration `20260711150000_add_project_members`. Cascade-deletes with
  the parent project. Relations added to `User.projectMemberships` and `Project.members`.

- **API** (`apps/api/src/modules/projects/`):
  - `ProjectsService.assertProjectAccess(projectId, userId, requiredRole)` — checks ownership first
    (the original `assertOwnership` is untouched); falls through to a `ProjectMember` row with
    `acceptedAt` set and a role-hierarchy comparison (`MEMBER_ROLE_ORDER` index). 404 vs 403
    distinguished correctly.
  - `findAll(userId)` — replaces the old `findAllByUser`; now returns owned projects merged with
    accepted-membership shared projects, sorted by `updatedAt`. Shared entries carry `memberRole`.
  - `getProjectMembers`, `inviteMember`, `acceptInvite` (idempotent), `removeMember`.
  - Four new endpoints on `ProjectsController`: `GET/POST /projects/:id/members`,
    `POST /projects/:id/members/accept`, `DELETE /projects/:id/members/:userId`.

- **Web** (`apps/web/src/`):
  - `StructuralPanel` union extended with `'collaboration'`.
  - `useProjectMembers` / `useInviteMember` / `useAcceptInvite` / `useRemoveMember` in
    `hooks/useProjects.ts`.
  - `CollaborationPanel.tsx` — member list (name, email, role, pending badge) + invite-by-email
    form with role picker (owner-gated; API enforces on the server too) + per-member remove button
    for non-OWNER rows. Follows the same structural-panel pattern as FoundationPanel et al.
  - `EditorToolbar` — new "Team / Csapat / Echipă" button at the end of `structuralTools`.
  - `EditorLayout` — `panelTitle` + `renderRightPanel` cases for `'collaboration'`.

- **i18n**: `collaboration.*` (12 keys: title, members, inviteEmail, inviteRole, inviteButton,
  roleOwner, roleEditor, roleViewer, removeButton, pendingInvite, noMembers, toolCollab) added to
  `Dictionary` in `types.ts` and all three locale files (ro / hu / en); `satisfies Dictionary`
  enforces completeness at compile time.

- **E2E**: `apps/api/test/collaboration.e2e-spec.ts` — 5 cases: empty member list, invite by
  email, accept invite, shared project appears in `findAll`, remove member leaves list empty.

## Spec documents
All 13 PDFs in `docs/materials/` are the source of truth.
Never add functionality not described there.
