# Prompt for next session

> Living handoff file — update this at the end of every session instead of relying on
> conversation memory. Paste this file's content (or point Claude at it) at the start of a
> fresh session to resume exactly where the last one left off. Full technical detail for
> everything mentioned here lives in `CLAUDE.md` — this file is the short "what's next" pointer,
> not a duplicate of it.

**Branch**: `claude/step-7-complete-build-la97k7` (PRs target `main`)
**Last commit as of writing**: `bc3257e` — "feat: Romanian building-code law module 3 — centuri / ring beams (CR6-2013)"

## Where things stand

Two parallel tracks are in progress:

### Track A — BIM-detail (brick/rebar-level 2D/3D) — Steps 0-8 done, Step 9 open
See `CLAUDE.md` → "BIM-detail feature (brick/rebar-level 2D/3D detail) — status". Opening-aware
brick cutting, longitudinal rebar instancing, viewer LOD, low-perf fallback — all done and
browser-verified. **Open**: Step 9 — stirrup/bent rebar geometry for the 3D viewer (a bent closed
loop needs its own `bim-engine` calc + instance pool, distinct from the straight-longitudinal-bar
code that already exists).

### Track B — Romanian structural building-code "law modules" — Modules 1-3 done
See `CLAUDE.md` → "Romanian structural building-code 'law modules' — status". Goal: every
structural default the system builds with (foundation, confining elements, rebar) traces to a
real, cited Romanian standard — same discipline Key rule 7 already requires for `Material`.

Done: **Module 1 (Foundation** — STAS 6054-77 frost depth, NP 112-2014 strip-footing
reinforcement**)**, **Module 2 (Confined masonry** — stâlpișori S1/S2 + buiandrug lintels,
CR6-2013**)**, **Module 3 (Centuri** — ring beams, CR6-2013**)**. Each shipped as: real-source
research → `packages/bim-engine` pure calc (unit-tested) → Prisma model + migration → seeded
`Material`s where relevant → `HousesService.getX(houseId)` idempotent auto-provisioning →
controller route → e2e test → `CLAUDE.md` update → commit.

## What's next (in rough priority order)

### 1. Finish the open law-module gaps
These are explicitly documented in `CLAUDE.md` as gaps, not guesses — don't fill them with
invented numbers, do a real research pass first (see "Research method" below):
- **S3 tie-columns** (opening-triggered stâlpișori) — needs a cited peak-ground-acceleration
  (ag) table by locality/județ for P100-1/2013, plus validated minimum masonry-pier-length
  thresholds. We have isolated points (București ag=0.30g, Iași ag=0.25g) but no usable
  by-locality table yet.
- **Concrete cover table** (NE 012/1-2022 Annex J) for elements beyond the footing/tie-column/
  centură cases already done — walls, slabs. We confirmed the table *lives* in Annex J but
  couldn't retrieve the actual mm values (official PDF hosts are blocked — see below).
- **Monolithic (non-prefabricated) lintel reinforcement** — no primary-source citation found for
  bar count/diameter/stirrups of a cast-in-place buiandrug. The prefabricated default (this
  project's actual current output) doesn't need this, but a monolithic override path eventually
  will.
- **Module 4 — frame-column reinforcement (P100-1/2013)** — only relevant if/when a
  non-confined-masonry (frame) house type exists. The project is masonry-only today; likely low
  priority unless the product direction changes.

### 2. The big next feature — interactive structural-element resize editor
**User-specified, explicitly deferred until the law-module sequence above finishes.** Requested
2026-07-08. Full description (translated/organized from the original Hungarian request):

> When a designer clicks a dimensioned structural element (e.g. a door/window opening) that
> doesn't fit their needs, an edit icon should appear, letting them resize it. On resize, the
> geometry must cascade correctly:
> - **Bricks**: remove/regenerate the ones no longer needed around the opening (this already
>   happens automatically today, since `useBrickInstances` recomputes from the wall's current
>   opening set — verify this still holds once resize UI exists, don't assume).
> - **Lintel (buiandrug)**: its length/bearing must follow the new opening width (today `Lintel`
>   is auto-provisioned *once* and cached — resizing an opening after that will leave a stale
>   `Lintel` row; this needs either a recompute-on-change hook or an explicit "re-provision"
>   action, mirroring how `AiService.rebuildFromConversation` re-syncs stale AI-driven state).
> - **Rebar length/splicing**: a single rebar bar has a maximum stock length — **user-confirmed:
>   both 6m AND 12m are real standard/commercial lengths** (this resolved an earlier ambiguity;
>   don't re-derive it, it's a settled fact from the person commissioning this work). When a
>   continuous run needs to be longer than one stock bar, insert a proper lap splice (toldás) —
>   the user's own example: "a 20-20cm overlap between the two bars" — with correct overlap
>   length per the applicable standard (not necessarily 20cm generically; we already have a
>   *specific* case for this — stâlpișor bars lap ≥50Φ, ≥60Φ at foundation level, CR6-2013 — a
>   *general* rule for ordinary elements (footings/columns/beams, not just confined-masonry tie
>   columns) still needs to be pinned down per EN 1992-1-1 §8.7 / NE 012.
> - **Corner bends**: rebar must bend at a precise, code-correct angle/radius at corners (e.g. an
>   L-shaped footing/tie-column corner bar) — needs EN 1992-1-1 §8.3 / Table 8.1N minimum
>   mandrel-diameter values (a commonly-cited default is 4Φ for bars ≤16mm, 7Φ for bars >16mm —
>   **not yet confirmed against a primary/official source**, treat as unverified until checked).
> - **AI chat integration**: all of the above must also be triggerable via natural-language
>   requests in the existing AI conversation, extending `design_update`/
>   `AiService.applyDesignUpdate` (see `CLAUDE.md`'s "AI chat → actual House/Room data" section
>   for how that pipeline currently works). User's own example phrasing:
>   *"I see the connecting beams above the openings only have 20cm bearing each side — let's
>   increase that to 40-40cm"* and *"I see the rebar splices are only 15cm — every splice should
>   be 60cm with stirrups every 10cm."* The AI needs to be able to both **observe** a
>   spec value (read the current `ReinforcementSpec`/`Lintel` row) and **propose/apply** an edit
>   to it through conversation, not just create new rooms/walls like `design_update` does today.

**This is a genuinely large feature** — touches: 2D/3D canvas UI (click-to-select + resize
handles), a real data-model concept that doesn't exist yet (individual rebar *runs* with splice
points and bend geometry, vs. today's flat "one repeating bar pattern" `ReinforcementSpec`), and
the AI conversation pipeline. Break it into the same disciplined sequence the law modules used —
research → data model → `bim-engine` calc → API → UI — don't try to do it in one pass.

**A research pass specifically for this feature's underlying standards is still needed** before
implementation starts (general — not confined-masonry-specific — lap splice length formula, bend
radius/mandrel diameter table, and confirmation of the two rebar stock lengths' typical
diameter-availability). This was attempted 2026-07-08 but both research agents hit a session
usage limit before finishing — re-run it fresh at the start of the session that picks this up.

### 3. User will upload a real, permitted blueprint (tervrajz)
The user has a finished floor plan with all official permits/approvals already on it, and plans
to upload it as a reference/inspiration. **Once it's available**: treat it as a concrete
ground-truth example to validate the law modules against (does the auto-provisioned
foundation/tie-column/centură/lintel output look like what a real approved Romanian permit
drawing actually shows?), and as a source of real dimensional conventions for the resize-editor
feature above. Don't guess ahead of it — if it changes assumptions made in Modules 1-3, revisit
them.

## Research method (carry this forward)

- **Official PDF hosts are systematically blocked** in this environment: `mdlpa.ro`,
  `legislatie.just.ro`, `cnadnr.ro`, ASRO's shop, and others all return HTTP 403 to `WebFetch`
  — confirmed across many distinct domains and repeated attempts, not a one-off. Don't keep
  retrying the same class of URL expecting a different result.
- **`WebSearch`'s own synthesis still works** and pulls accurate technical content from indexed
  secondary sources (course PDFs, technical press, manufacturer datasheets) even when the
  underlying page can't be directly fetched. Use it as the primary research tool.
- **Cross-check before accepting a number**: don't take a single secondary source at face value.
  Run at least two independently-phrased queries and only accept a value once they converge —
  this caught and confirmed several numbers in Modules 2-3 (e.g. the centură reinforcement
  values were confirmed via two separate searches landing on identical figures).
  Document the confidence level honestly in code comments/`CLAUDE.md` either way (see the
  "Citation-confidence note" pattern already used in Module 3's `CLAUDE.md` entry) — never
  silently upgrade a secondary-corroborated number to sound primary-verified.
  - The `Agent` tool (spawning research subagents) can hit its own session usage limits
    independently of your own direct tool calls — if an agent fails with a session-limit error,
    your own direct `WebSearch`/`WebFetch` calls may still work fine; try those before assuming
    all research is blocked.
- **Never invent a number to fill a gap.** If it can't be found and cited, document it explicitly
  as an open gap (see the "Not yet done" / "Still unclear" sections already in `CLAUDE.md` for
  the exact tone/format to match) rather than guessing — this is Key rule 7, non-negotiable per
  the user.

## Quick pointers into the code

- Law-module pattern to replicate: `packages/bim-engine/src/foundation.ts` (simplest),
  `confined-masonry.ts`, `centura.ts` (all unit-tested pure calc, no DB/framework deps).
- Service auto-provisioning pattern: `apps/api/src/modules/houses/houses.service.ts` —
  `getFoundation`/`getTieColumns`/`getCenturi`, all idempotent ("check if rows exist, provision
  once if not, always return current rows").
- Polymorphic-parent pattern for `AssemblyLayer`/`ReinforcementSpec`: nullable
  `wallId?`/`foundationId?`/`tieColumnId?`/`centuraId?` FKs + a raw-SQL Postgres CHECK constraint
  (`ReinforcementSpec_exactly_one_parent`) — Prisma has no native polymorphic relations, so any
  new parent type needs the CHECK constraint manually widened in the migration SQL (Prisma's
  auto-diff won't touch it, since it doesn't know about a constraint not declared in the schema
  file itself).
- e2e test pattern: `apps/api/test/{foundation,confined-masonry,centura}.e2e-spec.ts` — same
  register/verify/login boilerplate each time, worth extracting to a shared helper if a 4th
  module test is added.
