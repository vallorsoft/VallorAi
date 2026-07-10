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
// map with 7 discrete ag values in 0.05g steps — 0.10g, 0.15g, 0.20g, 0.25g,
// 0.30g, 0.35g, 0.40g. The full by-locality table lives in the official code
// (annex + MDLPA's interactive UTCB map at
// https://observator.mdlpa.ro/portal/apps/webappviewer/index.html?id=ceab6fd501124bcaaa701a8e2baf6a36);
// official PDF/host access is systematically blocked in this project's
// environment (mdlpa.ro, encipedia.org, inforisx.incd.ro, mobee.infp.ro,
// proiectare-constructii.ro all 403 on WebFetch; MDPI/arxiv/ResearchGate
// abstracts are accessible), so only the localities below — each cross-
// checked across two independently-phrased secondary-source searches —
// are seeded with `verified: true`. This grows the cited coverage from
// the original 4 localities (Module 2b) to 7 cross-checked cities; every
// other locality (Brașov, Craiova, Bacău, Buzău, Galați, Brăila, Sibiu,
// Sfântu Gheorghe, Suceava, Târgu Mureș, Oradea, Arad, Baia Mare, Botoșani
// and many more) remains an intentional gap — sources describe them in
// qualitative terms ("Brașov middle range", "Buzău high hazard") without
// converging on a specific 0.05g bucket, so seeding them would violate
// Key rule 7. Unmatched localities resolve to a deliberately CONSERVATIVE
// fallback (see FALLBACK_AG_G) with `verified: false`, surfaced the same
// way Material.specSheet.priceVerified / foundation depthVerified are —
// never a silent guess. A structural engineer must confirm the site's
// actual ag against the official P100-1/2013 map before construction use.

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
// Only values cross-checked across two independent secondary-source searches
// (or already cited in this repo's Module 3 research) are listed — do NOT
// extend this map with an un-cross-checked value (Key rule 7). Keys are
// normalized (lowercase, diacritics-insensitive via the ș/ș variants below,
// no spaces).
export const AG_BY_LOCALITY: Record<string, number> = {
  // București — raised from 0.20g (P100/92) to 0.24g (P100-1/2006) to 0.30g
  // in P100-1/2013. Cited in arXiv 1301.1280 (Bucharest accelerogram scaling
  // paper) and cross-checked in academia.edu "Evolution of Seismic Design
  // Regulations in Romania".
  'bucurești': 0.3,
  bucuresti: 0.3,
  // Iași — 0.25g. Cited in MDPI Sustainability 9(2):270 (Iași urban-
  // resilience multi-criteria analysis) and cross-checked in INFP MOBEE's
  // vulnerable-locality summary.
  'iași': 0.25,
  iasi: 0.25,
  // Focșani / județul Vrancea — the Vrancea epicentral zone carries the
  // national maximum 0.40g. Cited in ISSMGE ch489 (Vrancea harmonization
  // paper, explicit "Focșani ag=0.40g Tc=1.0s") and cross-checked across
  // Encipedia/Revista Constructiilor summaries.
  'focșani': 0.4,
  focsani: 0.4,
  vrancea: 0.4,
  // Cluj-Napoca / județul Cluj — the national minimum zone, 0.10g. Widely
  // cited as "the lowest ag zone in Romania" across every summary of the
  // P100-1/2013 map (Encipedia, Fanatik, Revista Constructiilor); cross-
  // checked in Dlubal's P100-1/2013 seismic-load reference.
  'cluj': 0.1,
  'cluj-napoca': 0.1,
  clujnapoca: 0.1,
  // Timișoara — 0.20g. Cited in ResearchGate 364994895 (Timisoara historic-
  // building vulnerability case study, "ag=0.20g") and cross-checked in
  // academia.edu 84986954 (Timisoara historical-areas vulnerability paper,
  // same value).
  'timișoara': 0.2,
  timisoara: 0.2,
  // Constanța — 0.20g. Cited in the OAR Constanța 2022 park-concurs
  // documentation ("Municipiul Constanța ag=0.20g Tc=0.7 sec" per P100-1)
  // and cross-checked across Dlubal's P100-1/2013 reference + secondary-
  // source summaries. Constanța sits in the Black-Sea coastal zone, not
  // directly on the Vrancea axis, hence a moderate value.
  'constanța': 0.2,
  constanta: 0.2,
  // Ploiești / județul Prahova — 0.35g. On the Vrancea-Bucharest axis; the
  // Observatorul Prahovean seismic-risk feature explicitly states
  // "Ploieștiul are un indicator seismic 0.35" (on the 0.10-0.40 P100-1/2013
  // scale) and Fanatik's national risk summary places Prahova among the
  // 0.30-0.40g bracket, converging on 0.35g. Cross-checked in secondary
  // industry press coverage (Revista Constructiilor's Prahova hazard
  // discussion) and Encipedia's PGA-range article.
  'ploiești': 0.35,
  ploiesti: 0.35,
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
