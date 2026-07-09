# Prompt for next session

> Living handoff file — update this at the end of every session instead of relying on
> conversation memory. Paste this file's content (or point Claude at it) at the start of a
> fresh session to resume exactly where the last one left off. Full technical detail for
> everything mentioned here lives in `CLAUDE.md` — this file is the short "what's next" pointer,
> not a duplicate of it.

**Branch**: `claude/pr33-completion-epiad4` (PRs target `main`)
**Last landed work (2026-07-09)**: the "remaining developments" sweep — BIM step 9 (stirrups +
tie-column/centură 3D cages), structural cost BOQ, `StructuralPanel` + `OpeningsPanel` editor
UI, manual wall/room drawing wired to the API, the editor SSR-500 fix, and the Key rule 9
design audit (zero emoji, landing redesigned). See PROGRESS.md's "Session 2026-07-09" table.
Everything test-covered (bim-engine 98 unit / API 28 e2e) and browser-verified via a local
full stack (Postgres + API + web + Playwright).

## Where things stand

- **Track A — BIM-detail (brick/rebar 2D/3D)**: Steps 0-9 ALL DONE. The detail LOD tier renders
  bricks (opening-aware cuts), longitudinal bars, wall stirrup loops, and the confining
  elements' translucent concrete + full cages.
- **Track B — law modules**: Modules 1-3 done INCLUDING their UI panels, cost-BOQ lines and 3D
  geometry (all closed 2026-07-09). The flat `structure` cost rate is gone once real lines
  exist; floor slabs remain unmodeled and unpriced (documented gap — do not invent a rate).
- **Editor**: wall drawing (snap/preview/chaining), room placement, opening add/delete with
  lintel display, structural inspector, floor switcher, 2D/3D toggle — all wired and verified.

## What's next (in rough priority order)

### 1. The big deferred feature — interactive structural-element resize editor
User-specified (2026-07-08), deferred until the law modules finished — they now have. Full
description preserved in the previous version of this file (git history:
`git show 7e7b5cd:PROMPT_FOR_NEXT_SESSION.md`, section 2) and summarized: click a dimensioned
element (e.g. an opening) → resize → bricks/lintel/rebar re-derive correctly, including lap
splices (6m/12m stock lengths — user-confirmed facts), code-correct corner bends, and the same
edits triggerable via AI chat (`design_update` extension for observing/editing spec values).
**Start with the research pass** (general lap-splice formula per EN 1992-1-1 §8.7 / NE 012,
mandrel-diameter table §8.3/Table 8.1N — the commonly-cited 4Φ/7Φ default is NOT yet verified,
and diameter availability per stock length). Note the known staleness trap: `Lintel` rows are
provisioned once and cached — an opening resize must re-derive or delete+re-read them.

### 2. Smaller open gaps (all documented, none blocking)
- S3 residual-pier-length trigger (no confirmed primary-source threshold yet).
- Fuller cited ag-by-locality table (`seismic.ts` seeds 4 cities, conservative fallback).
- Concrete-cover table completion (NE 012/1-2022 Annex J values still unretrievable — official
  PDF hosts 403 in this environment).
- Monolithic (cast-in-place) lintel reinforcement — no citation found yet.
- Centură wall-set-back width variant (250mm with exterior insulation).
- Floor-slab model (would unlock slab BOQ + real storey heights; `DEFAULT_SLAB_THICKNESS_MM`
  in centura.ts is the only slab number today).
- `houses.controller.ts` room/wall/opening mutations still lack per-house ownership checks
  (pre-existing gap noted in PROGRESS.md Phase 1; the AI endpoints DO check).
- Production deploy of everything since migration `add_material_assembly_reinforcement` needs
  the usual baseline/migrate-deploy care (see PROGRESS.md Phase 0 action note).

### 3. User will upload a real, permitted blueprint (tervrajz)
Unchanged — validate the auto-provisioned foundation/tie-column/centură/lintel output against
it when it arrives; revisit Module 1-3 assumptions if they conflict.

## Research method (carry this forward)
Unchanged from before, in short: official RO PDF hosts systematically 403 here; use WebSearch
synthesis, cross-check every number across two independently-phrased queries, document
confidence honestly (see the "Citation-confidence note" pattern in CLAUDE.md), and NEVER invent
a number to fill a gap (Key rule 7).

## Quick pointers into the code
- Structural 3D: `packages/bim-engine/src/structural-rebar.ts` +
  `apps/web/src/components/viewer3d/useStructuralInstances.ts` / `StructuralConcrete.tsx`.
- Structural BOQ: `costs.service.ts` → `calculateStructuralBoq` (per-material lines, aggregated
  per element category; steel is centerline weight, hooks/laps excluded — documented).
- Editor panels: `StructuralPanel.tsx` (house-level, no selection), `WallLayerPanel.tsx` →
  `OpeningsPanel.tsx` (selected wall).
- Drawing: `FloorPlanCanvas.tsx` (`editorMode`, snap/preview/chaining), mutations in
  `hooks/useProjects.ts` (`useAddWall`/`useAddRoom`/`useAddOpening`/`useDeleteOpening`).
- e2e pattern: `apps/api/test/*.e2e-spec.ts` — same register/verify boilerplate; local run
  needs Postgres (`service postgresql start`, role `vallorai`/`vallorai_local`, db
  `vallorai_dev`, `prisma migrate deploy` + `db:seed`).
- Browser verification pattern: scratchpad Playwright scripts against `pnpm dev` API+web with
  tokens planted in localStorage; `localStorage['viewer3d.ignoreLowPerf']='1'` to reach the
  brick/rebar detail tier in software-GL containers.
