import { composeRebarInstanceMatrices, generateWallLongitudinalRebarInstances } from './rebar-instancing'
import { generateLongitudinalRebarLayout } from './rebar'
import type { WallPlacementMm } from './instancing'
import type { RebarBarSpec } from './types'

// Step 8 reference values, hand-calculated. Spec values are within the
// researched SR 438-1:2012 range (Ø6–32) with NE 012/2-2022-plausible cover.

const spec: RebarBarSpec = {
  diameterMm: 12,
  spacingMm: 200,
  coverMm: 25,
  role: 'LONGITUDINAL',
}

describe('rebar instancing — longitudinal bars as unit-cylinder matrices (step 8)', () => {
  it('places bars along an X-aligned wall with correct scale and across-thickness offsets', () => {
    // 4m wall along +X, 300mm thick, base at 0.
    const placement: WallPlacementMm = {
      startXMm: 0,
      startZMm: 0,
      endXMm: 4000,
      endZMm: 0,
      baseYMm: 0,
      heightMm: 2500,
      thicknessMm: 300,
    }
    const { count, matrices } = generateWallLongitudinalRebarInstances(placement, spec)

    // usable width = 300 - 2×25 = 250 -> floor(250/200)+1 = 2 bars.
    expect(count).toBe(2)

    // Bar length = 4000 - 2×25 = 3950mm; centered at xMm = 2000.
    // Column 1 (cylinder axis) = wall direction × length: (3.95, 0, 0).
    expect(matrices[4]).toBeCloseTo(3.95, 6)
    expect(matrices[5]).toBeCloseTo(0, 6)
    expect(matrices[6]).toBeCloseTo(0, 6)
    // Column 0 = across normal × Ø: for u=(1,0,0), p=(0,0,1) -> (0, 0, 0.012).
    expect(matrices[0]).toBeCloseTo(0, 6)
    expect(matrices[2]).toBeCloseTo(0.012, 6)
    // Column 2 = world up × Ø.
    expect(matrices[9]).toBeCloseTo(0.012, 6)

    // Translations: x at wall middle, y at cover height, z at ±125mm of the
    // wall line (bars at z=25 and z=275 across the 300mm thickness).
    expect(matrices[12]).toBeCloseTo(2.0, 6)
    expect(matrices[13]).toBeCloseTo(0.025, 6)
    expect(matrices[14]).toBeCloseTo(-0.125, 6)
    expect(matrices[16 + 14]).toBeCloseTo(0.125, 6)
  })

  it('rotates the bar axis onto a Z-aligned wall direction', () => {
    const placement: WallPlacementMm = {
      startXMm: 0,
      startZMm: 0,
      endXMm: 0,
      endZMm: 3000,
      baseYMm: 0,
      heightMm: 2500,
      thicknessMm: 250,
    }
    const { count, matrices } = generateWallLongitudinalRebarInstances(placement, spec)
    expect(count).toBe(2)

    // Cylinder axis column now points along +Z with the 2950mm bar length.
    expect(matrices[4]).toBeCloseTo(0, 6)
    expect(matrices[6]).toBeCloseTo(2.95, 6)
    // Across normal for u=(0,0,1) is p=(-1,0,0).
    expect(matrices[0]).toBeCloseTo(-0.012, 6)
    expect(matrices[2]).toBeCloseTo(0, 6)
  })

  it('returns empty results for zero-length walls and non-longitudinal roles', () => {
    const placement: WallPlacementMm = {
      startXMm: 0,
      startZMm: 0,
      endXMm: 0,
      endZMm: 0,
      baseYMm: 0,
      heightMm: 2500,
      thicknessMm: 250,
    }
    expect(generateWallLongitudinalRebarInstances(placement, spec).count).toBe(0)
    expect(
      generateWallLongitudinalRebarInstances(
        { ...placement, endXMm: 3000 },
        { ...spec, role: 'STIRRUP' },
      ).count,
    ).toBe(0)
  })

  it('composes matrices 1:1 with the pure layout', () => {
    const placement: WallPlacementMm = {
      startXMm: 1000,
      startZMm: 2000,
      endXMm: 5000,
      endZMm: 2000,
      baseYMm: 0,
      heightMm: 2500,
      thicknessMm: 300,
    }
    const layout = generateLongitudinalRebarLayout({ lengthMm: 4000, widthMm: 300 }, spec)
    const composed = composeRebarInstanceMatrices(placement, layout)
    expect(composed.count).toBe(layout.length)
    expect(composed.matrices).toHaveLength(layout.length * 16)
    // Offset start point shifts translations: bar center x = 1000+2000 = 3m.
    expect(composed.matrices[12]).toBeCloseTo(3.0, 6)
    expect(composed.matrices[14]).toBeCloseTo(2.0 - 0.125, 6)
  })
})
