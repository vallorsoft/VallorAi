import {
  deriveRoofSpec,
  deriveRidgeHeight,
  deriveMonoslopeRise,
  deriveHippedRidgeLength,
  DEFAULT_ROOF_PITCH_DEG,
  DEFAULT_ROOF_OVERHANG_M,
} from './roof'

describe('roof — deriveRidgeHeight', () => {
  it('rises (span/2)·tan(pitch) for a gabled roof', () => {
    // 8 m span at 35° → 4·tan(35°) ≈ 2.80 m.
    expect(deriveRidgeHeight('GABLED', { lengthM: 10, widthM: 8 }, 35)).toBeCloseTo(2.8, 1)
  })

  it('uses the shorter side of the footprint as the span (ridge runs the longer side)', () => {
    // 10×8 → span 8; swap to 8×10 → still 8.
    expect(deriveRidgeHeight('GABLED', { lengthM: 10, widthM: 8 }, 35)).toBeCloseTo(
      deriveRidgeHeight('GABLED', { lengthM: 8, widthM: 10 }, 35),
      2,
    )
  })

  it('a flat roof has no rise', () => {
    expect(deriveRidgeHeight('FLAT', { lengthM: 10, widthM: 8 }, 0)).toBe(0)
  })
})

describe('roof — deriveRoofSpec', () => {
  it('gabled default: 35° pitch, 0.7 m overhang, non-zero ridge', () => {
    const spec = deriveRoofSpec('GABLED', { lengthM: 10, widthM: 8 })
    expect(spec.type).toBe('GABLED')
    expect(spec.pitchDeg).toBe(DEFAULT_ROOF_PITCH_DEG)
    expect(spec.overhangM).toBe(DEFAULT_ROOF_OVERHANG_M)
    expect(spec.ridgeHeightM).toBeGreaterThan(0)
    expect(spec.pitchVerified).toBe(true)
    expect(spec.overhangVerified).toBe(false)
  })

  it('hipped default matches gabled ridge for the same footprint', () => {
    const g = deriveRoofSpec('GABLED', { lengthM: 10, widthM: 8 })
    const h = deriveRoofSpec('HIPPED', { lengthM: 10, widthM: 8 })
    expect(h.ridgeHeightM).toBe(g.ridgeHeightM)
  })

  it('flat: 0° pitch, small drip-edge overhang, no ridge', () => {
    const spec = deriveRoofSpec('FLAT', { lengthM: 10, widthM: 8 })
    expect(spec.pitchDeg).toBe(0)
    expect(spec.ridgeHeightM).toBe(0)
    expect(spec.overhangM).toBeGreaterThan(0)
  })

  it('monoslope: rise covers the full shorter span (single sloped plane)', () => {
    // 8 m span at 35° → 8·tan(35°) ≈ 5.60 m — twice a gable's ridge over the
    // same footprint, because a monoslope plane covers the whole span at once.
    const spec = deriveRoofSpec('MONOSLOPE', { lengthM: 10, widthM: 8 })
    expect(spec.ridgeHeightM).toBeCloseTo(5.6, 1)
    expect(spec.pitchDeg).toBe(DEFAULT_ROOF_PITCH_DEG)
  })
})

describe('roof — deriveMonoslopeRise', () => {
  it('is span · tan(pitch)', () => {
    // Sanity: 10 m at 45° → exactly 10 m rise.
    expect(deriveMonoslopeRise(10, 45)).toBeCloseTo(10, 5)
    // 8 m at 35° → 8·tan(35°) ≈ 5.60 m.
    expect(deriveMonoslopeRise(8, 35)).toBeCloseTo(5.6, 1)
  })

  it('is 0 at 0° pitch', () => {
    expect(deriveMonoslopeRise(10, 0)).toBe(0)
  })
})

describe('roof — deriveHippedRidgeLength', () => {
  it('is (long - short) for a rectangular footprint', () => {
    expect(deriveHippedRidgeLength({ lengthM: 12, widthM: 8 })).toBeCloseTo(4, 5)
    // Swapping length/width doesn't change the result.
    expect(deriveHippedRidgeLength({ lengthM: 8, widthM: 12 })).toBeCloseTo(4, 5)
  })

  it('collapses to 0 for a square footprint (hipped becomes a pyramid)', () => {
    expect(deriveHippedRidgeLength({ lengthM: 10, widthM: 10 })).toBe(0)
  })

  it('clamps to 0 when the short side exceeds the long (defensive)', () => {
    expect(deriveHippedRidgeLength({ lengthM: 6, widthM: 8 })).toBeGreaterThanOrEqual(0)
  })
})
