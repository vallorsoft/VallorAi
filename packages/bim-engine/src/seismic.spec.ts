import {
  resolveSeismicAg,
  isHighSeismicity,
  HIGH_SEISMICITY_AG_THRESHOLD_G,
  FALLBACK_AG_G,
} from './seismic'

describe('seismic — P100-1/2013 design ground acceleration (ag)', () => {
  describe('resolveSeismicAg', () => {
    it('returns the cited ag for a known locality, verified', () => {
      expect(resolveSeismicAg('București')).toEqual({ agG: 0.3, verified: true })
      expect(resolveSeismicAg('Iași')).toEqual({ agG: 0.25, verified: true })
      expect(resolveSeismicAg('Focșani')).toEqual({ agG: 0.4, verified: true })
      expect(resolveSeismicAg('Cluj-Napoca')).toEqual({ agG: 0.1, verified: true })
    })

    it('returns the cited ag for the newly-added cross-checked localities, verified', () => {
      // Added in the citations-expansion pass: Timisoara (0.20g),
      // Constanta (0.20g), Ploiesti (0.35g).
      expect(resolveSeismicAg('Timișoara')).toEqual({ agG: 0.2, verified: true })
      expect(resolveSeismicAg('Constanța')).toEqual({ agG: 0.2, verified: true })
      expect(resolveSeismicAg('Ploiești')).toEqual({ agG: 0.35, verified: true })
    })

    it('matches case- and diacritics-insensitively', () => {
      expect(resolveSeismicAg('bucuresti')).toEqual({ agG: 0.3, verified: true })
      expect(resolveSeismicAg('  IASI  ')).toEqual({ agG: 0.25, verified: true })
      expect(resolveSeismicAg('cluj')).toEqual({ agG: 0.1, verified: true })
      expect(resolveSeismicAg('TIMISOARA')).toEqual({ agG: 0.2, verified: true })
      expect(resolveSeismicAg('constanta')).toEqual({ agG: 0.2, verified: true })
      expect(resolveSeismicAg('ploiesti')).toEqual({ agG: 0.35, verified: true })
    })

    it('a Ploiesti/Bucuresti/Iasi/Vrancea site is high-seismicity, a Timisoara/Constanta/Cluj site is not', () => {
      // Sanity check: the newly-added cities land on the correct side of
      // the CR6-2013 S3 threshold (ag >= 0.25g).
      expect(isHighSeismicity(resolveSeismicAg('Ploiești').agG)).toBe(true)
      expect(isHighSeismicity(resolveSeismicAg('București').agG)).toBe(true)
      expect(isHighSeismicity(resolveSeismicAg('Focșani').agG)).toBe(true)
      expect(isHighSeismicity(resolveSeismicAg('Iași').agG)).toBe(true)
      expect(isHighSeismicity(resolveSeismicAg('Timișoara').agG)).toBe(false)
      expect(isHighSeismicity(resolveSeismicAg('Constanța').agG)).toBe(false)
      expect(isHighSeismicity(resolveSeismicAg('Cluj-Napoca').agG)).toBe(false)
    })

    it('falls back conservatively (unverified) for an unknown or missing locality', () => {
      expect(resolveSeismicAg('Nowhereville')).toEqual({ agG: FALLBACK_AG_G, verified: false })
      expect(resolveSeismicAg(null)).toEqual({ agG: FALLBACK_AG_G, verified: false })
      expect(resolveSeismicAg(undefined)).toEqual({ agG: FALLBACK_AG_G, verified: false })
    })

    it('fallback is at least the high-seismicity threshold (stricter S3 rule applies)', () => {
      expect(FALLBACK_AG_G).toBeGreaterThanOrEqual(HIGH_SEISMICITY_AG_THRESHOLD_G)
      expect(isHighSeismicity(resolveSeismicAg('Nowhereville').agG)).toBe(true)
    })
  })

  describe('isHighSeismicity', () => {
    it('is true at or above 0.25g, false below', () => {
      expect(isHighSeismicity(0.25)).toBe(true)
      expect(isHighSeismicity(0.3)).toBe(true)
      expect(isHighSeismicity(0.2)).toBe(false)
      expect(isHighSeismicity(0.1)).toBe(false)
    })
  })
})
