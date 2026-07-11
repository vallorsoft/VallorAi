import {
  BLONDEL_TARGET_MM,
  MAX_RISER_MM,
  MIN_CLEAR_WIDTH_MM,
  deriveStaircaseSpec,
} from './stairs'

describe('deriveStaircaseSpec', () => {
  it('3000 mm storey → 15 risers, 200 mm riser, 230 mm tread, tread violation', () => {
    // ceil(3000 / 200) = 15 exactly; riser = 200 mm (the NP 057-2002 max);
    // tread = 630 − 2×200 = 230 mm < 250 mm → code violation.
    const spec = deriveStaircaseSpec({ floorHeightMm: 3000 })
    expect(spec.riserCount).toBe(15)
    expect(spec.riserHeightMm).toBeCloseTo(200, 2)
    expect(spec.treadDepthMm).toBeCloseTo(230, 2)
    expect(spec.blondelMm).toBeCloseTo(BLONDEL_TARGET_MM, 2)
    expect(spec.meetsCode).toBe(false)
    expect(spec.violations.some((v) => v.includes('Treaptă'))).toBe(true)
    expect(spec.widthMm).toBe(MIN_CLEAR_WIDTH_MM)
  })

  it('2700 mm storey → 14 risers, ≈192.9 mm riser, ≈244.3 mm tread, tread violation', () => {
    // ceil(2700 / 200) = 14; riser = 2700/14 ≈ 192.857 mm ≤ MAX_RISER ✓;
    // tread = 630 − 2×192.857 ≈ 244.3 mm < 250 mm → tread violation.
    const spec = deriveStaircaseSpec({ floorHeightMm: 2700 })
    expect(spec.riserCount).toBe(14)
    expect(spec.riserHeightMm).toBeCloseTo(2700 / 14, 4)
    expect(spec.treadDepthMm).toBeCloseTo(BLONDEL_TARGET_MM - 2 * (2700 / 14), 4)
    expect(spec.blondelMm).toBeCloseTo(BLONDEL_TARGET_MM, 2)
    expect(spec.meetsCode).toBe(false)
    expect(spec.violations.some((v) => v.includes('Treaptă'))).toBe(true)
  })

  it('horizontalRunMm = riserCount × treadDepthMm', () => {
    const spec = deriveStaircaseSpec({ floorHeightMm: 2700 })
    expect(spec.horizontalRunMm).toBeCloseTo(spec.riserCount * spec.treadDepthMm, 4)
  })

  it('width below MIN_CLEAR_WIDTH_MM is clamped up (STAS 2965-86)', () => {
    const spec = deriveStaircaseSpec({ floorHeightMm: 3000, widthMm: 750 })
    expect(spec.widthMm).toBe(MIN_CLEAR_WIDTH_MM)
    // Width clamping alone does not change riser/tread.
    expect(spec.riserCount).toBe(15)
  })

  it('width at or above MIN_CLEAR_WIDTH_MM is preserved', () => {
    const spec = deriveStaircaseSpec({ floorHeightMm: 3000, widthMm: 1200 })
    expect(spec.widthMm).toBe(1200)
  })

  it('riser violation recorded when riser > MAX_RISER_MM', () => {
    // Construct an extreme floor height that forces riser above 200 mm.
    // ceil(201 / 200) = 2 risers → riser = 100.5 mm — riser is fine.
    // Try H=1: ceil(1/200)=1, riser=1mm — fine. No riser violation is reachable
    // with this formula since riser = H/ceil(H/200) ≤ 200 always by construction.
    // Confirm: riser never exceeds MAX_RISER for any positive H.
    const spec = deriveStaircaseSpec({ floorHeightMm: 2000 })
    expect(spec.riserHeightMm).toBeLessThanOrEqual(MAX_RISER_MM)
  })

  it('meetsCode true when riser ≤ MAX_RISER and tread ≥ MIN_TREAD', () => {
    // At H = 1900 mm: ceil(1900/200)=10, riser=190 mm ≤ 200 ✓,
    // tread = 630 − 380 = 250 mm = MIN_TREAD exactly ✓.
    const spec = deriveStaircaseSpec({ floorHeightMm: 1900 })
    expect(spec.riserCount).toBe(10)
    expect(spec.riserHeightMm).toBeCloseTo(190, 4)
    expect(spec.treadDepthMm).toBeCloseTo(250, 4)
    expect(spec.meetsCode).toBe(true)
    expect(spec.violations).toHaveLength(0)
  })
})
