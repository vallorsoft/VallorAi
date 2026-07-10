// Romanian building-code "law module" #1: foundations (fundații). Pure,
// deterministic constructive-minimum rules — not a load-bearing structural
// design (that needs a site-specific geotechnical study + engineer's
// calculation per NP 112-2014 Part I/II, which this does not replace). Every
// constant here traces to a cited real standard or widely-published
// constructive rule derived from one (see comments per constant), per
// CLAUDE.md Key rule 7 — nothing here is invented.

export interface FrostDepthResult {
  depthMm: number
  /** False when no cited per-locality value matched and the conservative
   *  national fallback was used instead — surface this the same way
   *  Material.specSheet.priceVerified is surfaced (an "unverified" notice),
   *  not a silent guess. */
  verified: boolean
}

// STAS 6054-77 "Adâncimi maxime de îngheț" defines frost depth as a
// nationwide isoline map, not a per-județ table — the standard itself only
// gives a handful of reference localities plus the nationwide range
// (600-1100mm, average ~750mm.) The entries below are the exact maxima for
// those cited localities (rounded up to the cited range's upper bound, the
// safe direction for a foundation depth). STAS 6054-77 explicitly excludes
// altitudes above 1000m and the Danube Delta, which require a local study
// regardless of any table.
export const FROST_DEPTH_MM_BY_LOCALITY: Record<string, number> = {
  'bucurești': 900,
  bucuresti: 900,
  cluj: 900,
  'cluj-napoca': 900,
  clujnapoca: 900,
  'iași': 900,
  iasi: 900,
  'timiș': 800,
  timis: 800,
  'timișoara': 800,
  timisoara: 800,
  'constanța': 800,
  constanta: 800,
  'brașov': 1000,
  brasov: 1000,
  'botoșani': 1000,
  botosani: 1000,
  dorohoi: 1000,
}

// Maximum among the cited lowland/plains localities above (excluding the
// Carpathian outlier at 1100mm covered by STAS 6054-77's own "isolated
// areas in the north of the Eastern Carpathians" note) — a conservative
// ceiling for a locality not in the table. Real, cited (it's STAS 6054-77's
// own reported range), but NOT a substitute for a site-specific value.
export const FALLBACK_FROST_DEPTH_MM = 900

function normalizeLocality(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * Minimum foundation depth per STAS 6054-77: the footing base must sit
 * below the frost line for the site's locality, so ground freezing beneath
 * the footing can't heave it. `locality` (a județ or city name, matched
 * case/diacritics-insensitively) is looked up in the cited table; an
 * unmatched or missing locality returns the conservative national fallback
 * with `verified: false`.
 */
export function resolveFrostDepthMm(locality?: string | null): FrostDepthResult {
  if (locality) {
    const match = FROST_DEPTH_MM_BY_LOCALITY[normalizeLocality(locality)]
    if (match !== undefined) return { depthMm: match, verified: true }
  }
  return { depthMm: FALLBACK_FROST_DEPTH_MM, verified: false }
}

// Constructive-minimum rule for a continuous (strip) footing under a
// masonry wall: the footing must overhang the wall on each side to spread
// its load — commonly cited as a 10-15cm overhang per side for ordinary
// residential loads (wider overhangs use a stepped/battered footing
// instead, out of scope here), with an absolute floor of 60cm regardless of
// wall thickness. The load-driven width a specific soil/wall actually needs
// is a geotechnical calculation (NP 112-2014 Part I), out of scope — this
// is the constructive floor beneath it.
export const STRIP_FOOTING_OVERHANG_MM = 150
export const STRIP_FOOTING_MIN_WIDTH_MM = 600

export function deriveStripFootingWidthMm(wallThicknessMm: number): number {
  return Math.max(STRIP_FOOTING_MIN_WIDTH_MM, wallThicknessMm + 2 * STRIP_FOOTING_OVERHANG_MM)
}

// NP 112-2014 continuous-footing minimum reinforcement: transverse
// resistance bars (perpendicular to the wall run, spanning the footing
// width) at minimum Ø10mm, 100-250mm spacing; longitudinal distribution
// bars (parallel to the wall run) at Ø6mm, 250mm spacing. Constructive
// minimums, not load-derived — the actual bar count a specific footing
// needs is a structural calculation, out of scope here.
export const STRIP_FOOTING_TRANSVERSE_MIN_DIAMETER_MM = 10
export const STRIP_FOOTING_TRANSVERSE_MAX_SPACING_MM = 250
export const STRIP_FOOTING_TRANSVERSE_MIN_SPACING_MM = 100
export const STRIP_FOOTING_DISTRIBUTION_DIAMETER_MM = 6
export const STRIP_FOOTING_DISTRIBUTION_SPACING_MM = 250
// NP 112-2014's minimum reinforcement ratio per direction — OB37 (smooth,
// mild) steel needs more area than PC52 (ribbed, higher grade) to reach the
// same minimum resistance.
export const STRIP_FOOTING_MIN_RATIO_OB37 = 0.001 // 0.10%
export const STRIP_FOOTING_MIN_RATIO_PC52 = 0.00075 // 0.075%

export interface StripFootingReinforcementBar {
  diameterMm: number
  spacingMm: number
}

export interface StripFootingReinforcement {
  transverse: StripFootingReinforcementBar
  distribution: StripFootingReinforcementBar
}

/**
 * Constructive-minimum strip-footing reinforcement per NP 112-2014 — always
 * the code floor (min diameter at max allowed spacing), independent of
 * footing size, since sizing it up requires a load calculation this module
 * doesn't perform.
 */
export function deriveStripFootingReinforcement(): StripFootingReinforcement {
  return {
    transverse: {
      diameterMm: STRIP_FOOTING_TRANSVERSE_MIN_DIAMETER_MM,
      spacingMm: STRIP_FOOTING_TRANSVERSE_MAX_SPACING_MM,
    },
    distribution: {
      diameterMm: STRIP_FOOTING_DISTRIBUTION_DIAMETER_MM,
      spacingMm: STRIP_FOOTING_DISTRIBUTION_SPACING_MM,
    },
  }
}

// Lean/leveling concrete (beton de egalizare) under the structural footing —
// vasalatlan, thin layer poured on the sub-base to give the footing
// reinforcement a clean, level bearing surface; not part of the structural
// design. Widely cited thickness 50-100mm; C8/10 is the standard class for
// this application (see seeded Material "Beton de egalizare C8/10").
export const LEAN_CONCRETE_THICKNESS_MM = 100
export const LEAN_CONCRETE_CLASS = 'C8/10'

// Concrete cover for the footing's reinforcement: EN 1992-1-1 §4.4.1.3(4)
// (the basis for NE 012/1-2022's Annex J cover tables) sets the minimum
// cover at 40mm for concrete cast against prepared ground/blinding — which
// is exactly this case, since the footing is cast on the lean-concrete
// layer above, not directly on soil (that case would need 75mm). As with
// the seeded Material concrete-cover note, a structural engineer must
// confirm the exact Romanian national-annex figure before construction use.
export const STRIP_FOOTING_COVER_MM = 40

// ---------------------------------------------------------------------------
// NE 012/1-2022 Annex J concrete cover table (partial) — cited-only entries
// ---------------------------------------------------------------------------
//
// NE 012/1-2022 Annex J mirrors SR EN 1992-1-1 §4.4 Table 4.4N (cmin,dur)
// with the Romanian national annex — the same durability-class-vs-exposure-
// class matrix. Nominal cover cnom = cmin,dur + Δcdev; SR EN 1992-1-1 §4.4.1.3
// recommends Δcdev = 10 mm (the value the RO NA does not override), and every
// nominal cover constant in this codebase already applies that convention
// (see STRIP_FOOTING_COVER_MM = 40 for the against-blinding case, and
// TIE_COLUMN_COVER_MM = 25 for the XC1 interior-embedded case in
// confined-masonry.ts). Structural class S4 is the recommended default for a
// 50-year design working life, which is what an ordinary residential building
// targets — everything below assumes S4 unless noted otherwise.
//
// CITATION-CONFIDENCE NOTE: NE 012/1-2022 Annex J's official PDF host
// (mdlpa.ro, asro.ro, legislatie.just.ro) systematically 403s in this
// project's environment (same block that hit every prior module — see
// CLAUDE.md's "Romanian structural building-code law modules" section);
// values below come from two independently-phrased secondary-source
// searches converging on identical figures — Cyprus National Annex to
// EN 1992-1-1 (structural class S4 row: XC1 15mm, XC2/XC3 25mm, XC4 30mm),
// cross-checked in eurocodeapplied.com's cover calculator (same values)
// and Dlubal's RF-CONCRETE Members knowledge base entry for structural
// class S4 XC4 = 30mm cmin,dur. These are the EN 1992-1-1 recommended
// Table 4.4N values; the RO national annex is documented in secondary
// sources as not deviating from them for S4, but a structural engineer
// must confirm against an official NE 012/1-2022 copy before construction
// use, same "engineer must confirm" caveat every other law-module carries.

// XC1 — dry or permanently wet interior element (a wall reinforcement inside
// a rendered/interior masonry wall, out of any weather cycling). Nominal
// cover = cmin,dur (15) + Δcdev (10) = 25 mm.
export const WALL_COVER_MM_XC1 = 25

// XC2 — wet, rarely dry: an ordinary case for a below-grade / retaining
// masonry-wall reinforcement in contact with damp soil that dries only
// occasionally. Nominal cover = cmin,dur (25) + Δcdev (10) = 35 mm.
export const WALL_COVER_MM_XC2 = 35

// SLAB_COVER_MM_XC1 — monolithic reinforced-concrete slab, interior floor.
// Same XC1 exposure as an interior wall's reinforcement; nominal cover
// = 15 + 10 = 25 mm. Numerically identical to the wall value on purpose —
// the tie-column (`TIE_COLUMN_COVER_MM = 25` in confined-masonry.ts) also
// uses this XC1 nominal cover, so all three "interior embedded element"
// covers agree, as EN 1992-1-1 Table 4.4N intends.
export const SLAB_COVER_MM_XC1 = 25

// SLAB_COVER_MM_XC3 — monolithic reinforced-concrete slab, exterior /
// moderate-humidity exposure (a roof-terrace slab, a garage-below slab
// exposed to condensation, etc.). NE 012/1-2022 Annex J / EN 1992-1-1
// Table 4.4N group XC2 and XC3 into the same cmin,dur = 25 mm row; nominal
// cover = 25 + 10 = 35 mm, matching WALL_COVER_MM_XC2 exactly (they share
// the Table 4.4N row).
export const SLAB_COVER_MM_XC3 = 35

// TODO(cover-table): NE 012/1-2022 Annex J entries deliberately NOT added
// here — no converging pair of cited secondary sources found for these
// specific RO-national-annex figures:
//   * XC4 (cyclic wet-dry, e.g. a slab exposed to rain on top and a heated
//     room below) — EN 1992-1-1 Table 4.4N gives cmin,dur = 30 mm and Cyprus
//     NA agrees, so cnom = 40 mm is the likely value, but a second RO-
//     specific corroboration is missing.
//   * XD/XS/XA exposure classes (chloride and chemical attack) — irrelevant
//     for an ordinary residential building today; add when the app grows
//     coastal/underground/de-icing-salt use cases.
//   * The Δcdev = 10 mm deviation is the EN 1992-1-1 recommended value; the
//     RO NA is reported to keep it, but no direct primary-source citation
//     was captured — the values above use Δcdev = 10 mm consistently with
//     the pre-existing TIE_COLUMN_COVER_MM / STRIP_FOOTING_COVER_MM
//     constants (which the app already relies on).

// Structural footing concrete — NP 112-2014 / NE 012-2022 cite C16/20 as the
// typical minimum for an ordinary residential strip footing; C20/25 (already
// seeded for reinforced walls) is used where seismic/soil conditions call
// for it, which is a project-specific decision this module doesn't make.
export const STRIP_FOOTING_CONCRETE_CLASS = 'C16/20'

export interface FoundationSpec {
  depthMm: number
  depthVerified: boolean
  widthMm: number
  concreteClass: string
  leanConcreteClass: string
  leanConcreteThicknessMm: number
  reinforcement: StripFootingReinforcement
  reinforcementCoverMm: number
}

/**
 * Composes the full constructive-minimum strip-footing spec for a house:
 * depth from the site locality's frost line, width from the (thickest)
 * load-bearing wall it carries, fixed constructive-minimum concrete classes
 * and reinforcement. One spec is meant to apply uniformly to a house's
 * exterior/load-bearing wall perimeter (mirrors the wall assembly
 * auto-provisioning's per-wall-type default, not a per-wall calculation).
 */
export function deriveFoundationSpec(
  wallThicknessMm: number,
  locality?: string | null,
): FoundationSpec {
  const frost = resolveFrostDepthMm(locality)
  return {
    depthMm: frost.depthMm,
    depthVerified: frost.verified,
    widthMm: deriveStripFootingWidthMm(wallThicknessMm),
    concreteClass: STRIP_FOOTING_CONCRETE_CLASS,
    leanConcreteClass: LEAN_CONCRETE_CLASS,
    leanConcreteThicknessMm: LEAN_CONCRETE_THICKNESS_MM,
    reinforcement: deriveStripFootingReinforcement(),
    reinforcementCoverMm: STRIP_FOOTING_COVER_MM,
  }
}
