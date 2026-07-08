// Romanian seismic zonation — design ground acceleration (ag) per
// P100-1/2013 "Cod de proiectare seismică". This is the single input the
// confined-masonry module needs to pick CR6-2013's opening-confinement
// threshold (S3 tie-columns): the rule branches on whether a locality is in
// a high-seismicity zone (ag >= 0.25g) or not. Pure, deterministic lookup —
// same shape and same "cited-or-conservative-fallback" discipline as
// foundation.ts's resolveFrostDepthMm (Key rule 7: nothing invented).
//
// CITATION-CONFIDENCE NOTE (matches the pattern used in CLAUDE.md's Module 3
// entry): P100-1/2013's zonation is a nationwide isoline/administrative-unit
// map with discrete ag values (0.10g, 0.15g, 0.20g, 0.25g, 0.30g, 0.35g,
// 0.40g). The full by-locality table lives in the official code (and MDLPA's
// interactive UTCB map); official PDF/host access is systematically blocked
// in this project's environment (see PROMPT_FOR_NEXT_SESSION.md "Research
// method"), so only the handful of localities below — each cross-checked
// across two independently-phrased searches, or already cited in this repo's
// own prior research — are seeded with `verified: true`. Every other
// locality resolves to a deliberately CONSERVATIVE fallback (see
// FALLBACK_AG_G) with `verified: false`, surfaced the same way
// Material.specSheet.priceVerified / foundation depthVerified are — never a
// silent guess. A structural engineer must confirm the site's actual ag
// against the official P100-1/2013 map before construction use.

export interface SeismicAgResult {
  /** Design ground acceleration as a fraction of g (0.10–0.40). */
  agG: number
  /** True only when the locality matched a cited P100-1/2013 value below;
   *  false when the conservative national fallback was used instead. */
  verified: boolean
}

// The high-seismicity boundary CR6-2013 uses for its opening-confinement
// (S3) rule and for the 4Φ14 vs 4Φ12 tie-column reinforcement distinction.
// Localities at or above this are "red zone" for those provisions.
export const HIGH_SEISMICITY_AG_THRESHOLD_G = 0.25

// Cited P100-1/2013 design ground accelerations for reference localities.
// Only values cross-checked across two independent searches (or already
// cited in this repo's Module 3 research) are listed — do NOT extend this
// map with an un-cross-checked value (Key rule 7). Keys are normalized
// (lowercase, diacritics-insensitive via the ș/ș variants below, no spaces).
export const AG_BY_LOCALITY: Record<string, number> = {
  // București — raised from 0.24g (P100-1/2006) to 0.30g in P100-1/2013;
  // widely cited, and stated in this repo's prior research (CLAUDE.md).
  'bucurești': 0.3,
  bucuresti: 0.3,
  // Iași — 0.25g (cited in this repo's Module 3 research pass).
  'iași': 0.25,
  iasi: 0.25,
  // Focșani / județul Vrancea — the Vrancea epicentral zone carries the
  // national maximum 0.40g.
  'focșani': 0.4,
  focsani: 0.4,
  vrancea: 0.4,
  // Cluj-Napoca / județul Cluj — the national minimum zone, 0.10g.
  'cluj': 0.1,
  'cluj-napoca': 0.1,
  clujnapoca: 0.1,
}

// Fallback for a locality not in the cited table: the high-seismicity
// threshold itself. This is a deliberate CONSERVATIVE POLICY choice, not a
// claimed measurement for any specific site — it forces CR6-2013's stricter
// (1.5 m²) opening-confinement threshold to apply, so an unknown locality
// gets MORE tie-columns, never fewer. Consistent with every other "default
// toward more structure, not less" choice in these law modules (the always-
// generated extra centură, the unconditional 4Φ14 tie-column bars). Returned
// with verified:false so the UI can surface it as unverified.
export const FALLBACK_AG_G = HIGH_SEISMICITY_AG_THRESHOLD_G

function normalizeLocality(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * Design ground acceleration ag for a site locality per P100-1/2013. A
 * județ or city name (matched case/diacritics-insensitively) is looked up
 * in the cited table; an unmatched or missing locality returns the
 * conservative fallback with `verified: false`.
 */
export function resolveSeismicAg(locality?: string | null): SeismicAgResult {
  if (locality) {
    const match = AG_BY_LOCALITY[normalizeLocality(locality)]
    if (match !== undefined) return { agG: match, verified: true }
  }
  return { agG: FALLBACK_AG_G, verified: false }
}

/** True when the site is in the CR6-2013 high-seismicity ("red") zone. */
export function isHighSeismicity(agG: number): boolean {
  return agG >= HIGH_SEISMICITY_AG_THRESHOLD_G
}
