/**
 * Roof geometry + defaults.
 *
 * Prior to this module the House.roofType string was a label with no geometry
 * — the 3D viewer had nothing to render above the top floor, so an AI-
 * designed house terminated as an open-topped brick shell. This gives the
 * geometry a defensible constructive-minimum default set, in the same
 * bim-engine "pure calc, unit-tested, zero three/WebGL" shape as every other
 * standards-cited module here.
 *
 * Citations (secondary-source corroborated, same confidence bar as the law-
 * modules — an official STAS/normativ PDF host consistently 403s in this
 * environment):
 *
 * - **Pitch, ceramic tile**: manufacturers Tondach/Bramac quote min 22–25°
 *   for special profiles, 30° minimum with continuous sheathing for standard
 *   profiles (widely cross-cited across both manufacturers' RO product
 *   pages). **NP 057-2002** explicitly names 30° as the snow-retention
 *   threshold ("la acoperișurile cu pantă mai mare de 30° se vor prevedea
 *   opritoare de zăpadă"). Default pitch is **35°** — mid of the practical
 *   30°–45° residential range, safely above every manufacturer's minimum,
 *   above the snow-retention threshold so we don't hide the requirement in
 *   a marginal 30°. `pitchVerified: true`.
 *
 * - **Overhang** (streașină): 0.6–1.0 m is the widely-cited RO residential
 *   convention (protects the facade from driving rain and the plaster from
 *   snow melt). Default **0.7 m**. Not a normativ figure —
 *   `overhangVerified: false`.
 *
 * - **Roofing material default**: `Țiglă ceramică Tondach standard`
 *   (Wienerberger RO product line), seeded in packages/database. A
 *   manufacturer product, so `MANUFACTURER` source once the marketplace lands
 *   — for now `GENERIC_DEFAULT`, same as every other seeded default.
 */

/** RoofType lives in Prisma (enum) — bim-engine mirrors it as a plain union. */
export type RoofType = 'GABLED' | 'HIPPED' | 'FLAT' | 'MONOSLOPE'

/** NP 057-2002 snow-retention threshold + Tondach/Bramac practical range midpoint. */
export const DEFAULT_ROOF_PITCH_DEG = 35
/** Widely-cited RO residential convention — not a normativ figure. */
export const DEFAULT_ROOF_OVERHANG_M = 0.7
/** Flat-roof pitch — a real flat roof still needs 1–2% drain slope, but is drawn as horizontal. */
export const FLAT_ROOF_PITCH_DEG = 0

export interface RoofSpec {
  type: RoofType
  pitchDeg: number
  overhangM: number
  /** Vertical rise from the top-of-wall plate to the ridge, meters. Derived from footprint + pitch. */
  ridgeHeightM: number
  pitchVerified: boolean
  overhangVerified: boolean
}

export interface RoofFootprint {
  /** Extent along the ridge axis — the roof's ridge runs the length of the longer side by convention. */
  lengthM: number
  /** Extent perpendicular to the ridge — for a gable this is the span the two slopes cover. */
  widthM: number
}

/**
 * Derives the ridge rise for a symmetric roof over the given footprint.
 *
 * - GABLED / HIPPED: the ridge sits above the footprint's center at the height
 *   `(shorter_span / 2) * tan(pitch)` — both slopes cover half the shorter
 *   span. HIPPED's four-way topology raises the same ridge height, just with
 *   two additional hip triangles at the ends (see deriveHippedRidgeLength).
 * - MONOSLOPE: a single sloped plane. The high edge sits above one side and
 *   the low edge above the opposite one, so the rise is the FULL shorter span
 *   times tan(pitch), not half. Delegated to `deriveMonoslopeRise` so both
 *   the geometry consumer and the ridge-height writer agree.
 * - FLAT: no rise (0).
 */
export function deriveRidgeHeight(
  type: RoofType,
  footprint: RoofFootprint,
  pitchDeg: number,
): number {
  if (type === 'FLAT') return 0
  const span = Math.min(footprint.lengthM, footprint.widthM)
  if (type === 'MONOSLOPE') {
    return Math.round(deriveMonoslopeRise(span, pitchDeg) * 100) / 100
  }
  const rise = (span / 2) * Math.tan((pitchDeg * Math.PI) / 180)
  return Math.round(rise * 100) / 100
}

/**
 * Vertical rise over the full span for a single-slope (monoslope / mono-
 * pitch / pupitru) roof — the high edge is over one facade, the low edge is
 * over the opposite facade, so the roof plane covers the whole span at once
 * (unlike a symmetric gable where each slope covers half). `span` is the
 * horizontal distance between the two eaves.
 */
export function deriveMonoslopeRise(spanM: number, pitchDeg: number): number {
  return spanM * Math.tan((pitchDeg * Math.PI) / 180)
}

/**
 * Ridge length for a hipped roof over a rectangular footprint. Each end of
 * the roof folds inward as a hip triangle whose apex sits over the ridge line
 * at `shortSide/2` from the eave (same pitch as the main slopes → the hip's
 * horizontal reach along the long axis is exactly half the short side). So
 * the ridge — what remains between the two hip apexes — is
 * `longSide - shortSide`, clamped to 0 (a square footprint collapses to a
 * pyramid with a single apex, no ridge).
 */
export function deriveHippedRidgeLength(footprint: RoofFootprint): number {
  const long = Math.max(footprint.lengthM, footprint.widthM)
  const short = Math.min(footprint.lengthM, footprint.widthM)
  return Math.max(0, long - short)
}

/**
 * Derives the roof spec for a given house footprint + requested type. For
 * FLAT the pitch is 0 and no overhang is required by any cited normativ, so
 * defaults are 0/0; for pitched types the constructive-minimum default set
 * documented above is used.
 */
export function deriveRoofSpec(type: RoofType, footprint: RoofFootprint): RoofSpec {
  if (type === 'FLAT') {
    return {
      type,
      pitchDeg: FLAT_ROOF_PITCH_DEG,
      overhangM: 0.3,
      ridgeHeightM: 0,
      pitchVerified: true,
      overhangVerified: false,
    }
  }
  const pitchDeg = DEFAULT_ROOF_PITCH_DEG
  return {
    type,
    pitchDeg,
    overhangM: DEFAULT_ROOF_OVERHANG_M,
    ridgeHeightM: deriveRidgeHeight(type, footprint, pitchDeg),
    pitchVerified: true,
    overhangVerified: false,
  }
}
