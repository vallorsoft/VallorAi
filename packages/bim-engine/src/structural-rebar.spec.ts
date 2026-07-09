import {
  calculateStirrupQuantity,
  composeSegmentInstanceMatrices,
  composeWorldBoxMatrices,
  generateColumnRebarSegments,
  generateRunLongitudinalSegments,
  generateRunStirrupSegments,
  generateStirrupPositionsMm,
} from './structural-rebar'
import { rebarWeightPerMeterKg } from './rebar'

// Step 9 reference values, hand-calculated against the CR6-2013 confining-
// element minimums Modules 2-3 already cite (250×250 tie-column, 4×Ø14 +
// Ø6/150 stirrups, 25mm cover; centură Ø10 + Ø6/150).

describe('stirrup positions and quantity (step 9)', () => {
  it('spaces loops evenly so no gap exceeds the spec spacing', () => {
    // 2.7m tie-column, Ø6 @ 150, 25mm cover: usable 2650 -> ceil(2650/150)=18
    // intervals -> 19 loops, actual gap 2650/18 ≈ 147.2mm <= 150.
    const positions = generateStirrupPositionsMm(2700, 150, 25)
    expect(positions).toHaveLength(19)
    expect(positions[0]).toBe(25)
    expect(positions[18]).toBe(2675)
    expect(positions[1] - positions[0]).toBeCloseTo(2650 / 18, 6)
  })

  it('falls back to a single centered loop for a run shorter than twice the cover', () => {
    expect(generateStirrupPositionsMm(40, 150, 25)).toEqual([20])
  })

  it('computes loop centerline length and weight for the CR6 tie-column section', () => {
    // 250×250, cover 25, Ø6: centerline side = 250-50-6 = 194mm,
    // perimeter = 776mm. 2.7m run -> 19 loops (see above).
    const q = calculateStirrupQuantity(2700, { widthMm: 250, heightMm: 250 }, {
      diameterMm: 6,
      spacingMm: 150,
      coverMm: 25,
    })
    expect(q.count).toBe(19)
    expect(q.loopLengthMm).toBeCloseTo(776, 6)
    expect(q.totalWeightKg).toBeCloseTo(19 * 0.776 * rebarWeightPerMeterKg(6), 6)
  })
})

describe('tie-column rebar cage segments', () => {
  const column = {
    centerXMm: 2000,
    centerZMm: 3000,
    baseYMm: 0,
    heightMm: 2700,
    crossSectionMm: 250,
  }
  const longitudinal = { barCount: 4, diameterMm: 14, coverMm: 25 }
  const stirrup = { diameterMm: 6, spacingMm: 150, coverMm: 25 }

  it('generates 4 full-height corner bars plus 4 segments per stirrup loop', () => {
    const segments = generateColumnRebarSegments(column, longitudinal, stirrup)
    // 4 bars + 19 loops × 4 sides = 80 segments.
    expect(segments).toHaveLength(4 + 19 * 4)

    const bars = segments.filter((s) => s.diameterMm === 14)
    expect(bars).toHaveLength(4)
    // Corner inset = 25 + 7 = 32mm -> ±93mm around the center.
    expect(bars[0].fromXMm).toBeCloseTo(2000 - 93, 6)
    expect(bars[0].fromZMm).toBeCloseTo(3000 - 93, 6)
    expect(bars[0].fromYMm).toBe(0)
    expect(bars[0].toYMm).toBe(2700)

    // Every stirrup segment is horizontal, on the loop rectangle ±97mm
    // (250 - 2×25 - 6 = 194 across the centerline).
    const loops = segments.filter((s) => s.diameterMm === 6)
    for (const seg of loops) {
      expect(seg.fromYMm).toBeCloseTo(seg.toYMm, 6)
      expect(Math.abs(seg.fromXMm - 2000)).toBeCloseTo(97, 6)
      expect(Math.abs(seg.fromZMm - 3000)).toBeCloseTo(97, 6)
    }
  })
})

describe('horizontal run (centură) rebar segments', () => {
  // 4m centură along +X on a 380mm wall, 260mm deep (exterior: 2×130),
  // base at wall top 2700.
  const run = {
    startXMm: 0,
    startZMm: 0,
    endXMm: 4000,
    endZMm: 0,
    baseYMm: 2700,
    heightMm: 260,
    widthMm: 380,
  }

  it('arranges longitudinal bars 2 bottom + 2 top at the cover inset', () => {
    const segments = generateRunLongitudinalSegments(run, {
      barCount: 4,
      diameterMm: 10,
      coverMm: 25,
    })
    expect(segments).toHaveLength(4)
    // inset = 25 + 5 = 30: bottom row y = 2730, top row y = 2930.
    const ys = segments.map((s) => s.fromYMm).sort((a, b) => a - b)
    expect(ys).toEqual([2730, 2730, 2930, 2930])
    // across half = 190 - 30 = 160mm -> z = ±160 around the wall line.
    expect(Math.abs(segments[0].fromZMm)).toBeCloseTo(160, 6)
    // Bars run the length minus cover each end.
    expect(segments[0].fromXMm).toBe(25)
    expect(segments[0].toXMm).toBe(3975)
  })

  it('distributes a 5th bar into the bottom row evenly', () => {
    const segments = generateRunLongitudinalSegments(run, {
      barCount: 5,
      diameterMm: 10,
      coverMm: 25,
    })
    expect(segments).toHaveLength(5)
    const bottom = segments.filter((s) => s.fromYMm === 2730)
    expect(bottom).toHaveLength(3)
    const zs = bottom.map((s) => s.fromZMm).sort((a, b) => a - b)
    expect(zs[0]).toBeCloseTo(-160, 6)
    expect(zs[1]).toBeCloseTo(0, 6)
    expect(zs[2]).toBeCloseTo(160, 6)
  })

  it('generates vertical-plane stirrup loops along the run', () => {
    const segments = generateRunStirrupSegments(run, {
      diameterMm: 6,
      spacingMm: 150,
      coverMm: 25,
    })
    // usable 3950 -> ceil(3950/150) = 27 intervals -> 28 loops × 4 segments.
    expect(segments).toHaveLength(28 * 4)
    // Loop rectangle: across ±(380-50-6)/2 = ±162, y from 2728 to 2932.
    const first4 = segments.slice(0, 4)
    const ys = new Set(first4.flatMap((s) => [s.fromYMm, s.toYMm]))
    expect(ys).toEqual(new Set([2728, 2932]))
    for (const seg of first4) {
      // Each loop lives at one along-run station: x constant per loop.
      expect(seg.fromXMm).toBeCloseTo(25, 6)
    }
  })
})

describe('segment + box matrix composition', () => {
  it('maps a vertical segment onto the unit cylinder with correct scale/translation', () => {
    const { count, matrices } = composeSegmentInstanceMatrices([
      { fromXMm: 1000, fromYMm: 0, fromZMm: 2000, toXMm: 1000, toYMm: 2700, toZMm: 2000, diameterMm: 14 },
    ])
    expect(count).toBe(1)
    // Axis column = (0, 2.7, 0); cross-section columns have magnitude Ø.
    expect(matrices[4]).toBeCloseTo(0, 6)
    expect(matrices[5]).toBeCloseTo(2.7, 6)
    const col0 = Math.hypot(matrices[0], matrices[1], matrices[2])
    const col2 = Math.hypot(matrices[8], matrices[9], matrices[10])
    expect(col0).toBeCloseTo(0.014, 6)
    expect(col2).toBeCloseTo(0.014, 6)
    // Midpoint translation.
    expect(matrices[12]).toBeCloseTo(1.0, 6)
    expect(matrices[13]).toBeCloseTo(1.35, 6)
    expect(matrices[14]).toBeCloseTo(2.0, 6)
  })

  it('skips zero-length segments without leaving holes in the buffer', () => {
    const { count, matrices } = composeSegmentInstanceMatrices([
      { fromXMm: 0, fromYMm: 0, fromZMm: 0, toXMm: 0, toYMm: 0, toZMm: 0, diameterMm: 6 },
      { fromXMm: 0, fromYMm: 0, fromZMm: 0, toXMm: 1000, toYMm: 0, toZMm: 0, diameterMm: 6 },
    ])
    expect(count).toBe(1)
    expect(matrices).toHaveLength(16)
    expect(matrices[15]).toBe(1)
  })

  it('composes a rotated world box', () => {
    // 4m × 0.26m × 0.38m centură prism rotated 90° about Y.
    const { count, matrices } = composeWorldBoxMatrices([
      {
        centerXMm: 1000,
        centerYMm: 2830,
        centerZMm: 2000,
        sizeXMm: 4000,
        sizeYMm: 260,
        sizeZMm: 380,
        rotationYRad: Math.PI / 2,
      },
    ])
    expect(count).toBe(1)
    // Local X (length) maps to world -Z after +90° Y rotation.
    expect(matrices[0]).toBeCloseTo(0, 6)
    expect(matrices[2]).toBeCloseTo(-4, 6)
    expect(matrices[5]).toBeCloseTo(0.26, 6)
    expect(matrices[8]).toBeCloseTo(0.38, 6)
    expect(matrices[10]).toBeCloseTo(0, 6)
    expect(matrices[12]).toBeCloseTo(1.0, 6)
    expect(matrices[13]).toBeCloseTo(2.83, 6)
    expect(matrices[14]).toBeCloseTo(2.0, 6)
  })
})
