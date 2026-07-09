import {
  deriveRoofSpec,
  deriveRidgeHeight,
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
})
