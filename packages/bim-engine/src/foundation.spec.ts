import {
  resolveFrostDepthMm,
  deriveStripFootingWidthMm,
  deriveStripFootingReinforcement,
  deriveFoundationSpec,
  FALLBACK_FROST_DEPTH_MM,
  STRIP_FOOTING_MIN_WIDTH_MM,
  STRIP_FOOTING_COVER_MM,
  WALL_COVER_MM_XC1,
  WALL_COVER_MM_XC2,
  SLAB_COVER_MM_XC1,
  SLAB_COVER_MM_XC3,
} from './foundation'

describe('foundation — law module 1 (STAS 6054-77 / NP 112-2014 constructive minimums)', () => {
  describe('resolveFrostDepthMm', () => {
    it('returns the cited value for a known locality, verified', () => {
      expect(resolveFrostDepthMm('București')).toEqual({ depthMm: 900, verified: true })
      expect(resolveFrostDepthMm('brasov')).toEqual({ depthMm: 1000, verified: true })
    })

    it('is case- and diacritics-tolerant, and tolerant of whitespace', () => {
      expect(resolveFrostDepthMm('  Cluj-Napoca  ')).toEqual({ depthMm: 900, verified: true })
      expect(resolveFrostDepthMm('TIMISOARA')).toEqual({ depthMm: 800, verified: true })
    })

    it('falls back to the conservative national ceiling, unverified, for an unmatched locality', () => {
      expect(resolveFrostDepthMm('Satu Mare')).toEqual({
        depthMm: FALLBACK_FROST_DEPTH_MM,
        verified: false,
      })
    })

    it('falls back for a missing locality', () => {
      expect(resolveFrostDepthMm(undefined)).toEqual({
        depthMm: FALLBACK_FROST_DEPTH_MM,
        verified: false,
      })
      expect(resolveFrostDepthMm(null)).toEqual({
        depthMm: FALLBACK_FROST_DEPTH_MM,
        verified: false,
      })
    })
  })

  describe('deriveStripFootingWidthMm', () => {
    it('adds the 150mm overhang to each side of the wall', () => {
      // 380mm Leier wall -> 380 + 2*150 = 680mm.
      expect(deriveStripFootingWidthMm(380)).toBe(680)
    })

    it('clamps to the 600mm absolute minimum for a thin wall', () => {
      // 115mm partition wall would compute 415mm without the floor.
      expect(deriveStripFootingWidthMm(115)).toBe(STRIP_FOOTING_MIN_WIDTH_MM)
    })
  })

  describe('deriveStripFootingReinforcement', () => {
    it('returns the NP 112-2014 constructive minimums', () => {
      expect(deriveStripFootingReinforcement()).toEqual({
        transverse: { diameterMm: 10, spacingMm: 250 },
        distribution: { diameterMm: 6, spacingMm: 250 },
      })
    })
  })

  describe('deriveFoundationSpec', () => {
    it('composes depth/width/concrete/reinforcement for a verified locality', () => {
      const spec = deriveFoundationSpec(380, 'Iași')
      expect(spec).toEqual({
        depthMm: 900,
        depthVerified: true,
        widthMm: 680,
        concreteClass: 'C16/20',
        leanConcreteClass: 'C8/10',
        leanConcreteThicknessMm: 100,
        reinforcement: {
          transverse: { diameterMm: 10, spacingMm: 250 },
          distribution: { diameterMm: 6, spacingMm: 250 },
        },
        reinforcementCoverMm: 40,
      })
    })

    it('flags depthVerified false for an unlisted locality without altering the other fields', () => {
      const spec = deriveFoundationSpec(380, 'Vaslui')
      expect(spec.depthMm).toBe(FALLBACK_FROST_DEPTH_MM)
      expect(spec.depthVerified).toBe(false)
      expect(spec.widthMm).toBe(680)
    })
  })

  describe('NE 012/1-2022 Annex J — cited nominal cover constants', () => {
    // These constants exist to be reused by future wall / slab reinforcement
    // modules; nothing consumes them yet, so this test is a specification
    // guard rather than a behavior test — it locks in the two-source-cross-
    // checked values against silent edits.
    it('reports EN 1992-1-1 Table 4.4N S4 nominal cover (cmin,dur + Δcdev=10mm)', () => {
      // XC1: cmin,dur 15mm + Δcdev 10mm = 25mm — matches TIE_COLUMN_COVER_MM.
      expect(WALL_COVER_MM_XC1).toBe(25)
      expect(SLAB_COVER_MM_XC1).toBe(25)
      // XC2 & XC3 group into the same Table 4.4N row: cmin,dur 25mm + 10mm = 35mm.
      expect(WALL_COVER_MM_XC2).toBe(35)
      expect(SLAB_COVER_MM_XC3).toBe(35)
    })

    it('agrees on the interior-embedded XC1 cover across wall and slab', () => {
      // A tie-column, an interior wall reinforcement mat, and an interior
      // slab reinforcement mat all live in the same XC1 exposure — they must
      // report identical nominal cover.
      expect(WALL_COVER_MM_XC1).toBe(SLAB_COVER_MM_XC1)
    })

    it('the against-blinding footing cover stays higher than the XC1/XC2 covers', () => {
      // EN 1992-1-1 §4.4.1.3(4): concrete cast against prepared ground /
      // blinding gets a higher minimum (40mm) than an ordinary XC1/XC2
      // embedded element — sanity check the ordering is preserved.
      expect(STRIP_FOOTING_COVER_MM).toBeGreaterThan(WALL_COVER_MM_XC1)
      expect(STRIP_FOOTING_COVER_MM).toBeGreaterThanOrEqual(WALL_COVER_MM_XC2)
    })
  })
})
