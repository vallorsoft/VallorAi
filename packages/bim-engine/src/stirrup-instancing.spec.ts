import {
  composeStirrupInstanceMatrices,
  generateCenturaStirrupInstances,
  generateTieColumnStirrupInstances,
  type CenturaPlacementMm,
  type StirrupElementFrame,
  type TieColumnPlacementMm,
} from './stirrup-instancing'
import { generateStirrupLayout } from './stirrup'
import type { RebarBarSpec } from './types'

const tieColumnStirrupSpec: RebarBarSpec = {
  diameterMm: 6,
  spacingMm: 150,
  coverMm: 25,
  role: 'STIRRUP',
}

describe('stirrup instancing — 4-segment loops as unit-cylinder matrices (step 9)', () => {
  it('emits 4 segments per stirrup with correct scale and orientation on a vertical tie-column', () => {
    // Tie-column: 250×250mm, 2700mm tall, base at Y=0, plan (posX, posZ) = (2m, 3m).
    const placement: TieColumnPlacementMm = {
      posXMm: 2000,
      posZMm: 3000,
      baseYMm: 0,
      lengthMm: 2700,
      crossSectionAMm: 250,
      crossSectionBMm: 250,
    }
    const { count, matrices } = generateTieColumnStirrupInstances(placement, tieColumnStirrupSpec)
    // 18 loops × 4 segments (see stirrup.spec.ts count math).
    expect(count).toBe(18 * 4)

    // First loop sits at positionMm = 25 (cover), so Y at loop center = 0.025 m.
    // Its first segment (along axis A = +X, offset -halfB = -0.097 in Z):
    //   translation (2.0, 0.025, 3.0 - 0.097) = (2.0, 0.025, 2.903)
    //   column 1 (cylinder axis) = A × length_A = (0.194, 0, 0)
    //   column 0 (radial1) = B × Ø = (0, 0, 0.006)
    //   column 2 (radial2) = long axis × Ø = (0, 0.006, 0)
    expect(matrices[12]).toBeCloseTo(2.0, 6)
    expect(matrices[13]).toBeCloseTo(0.025, 6)
    expect(matrices[14]).toBeCloseTo(2.903, 6)
    expect(matrices[4]).toBeCloseTo(0.194, 6)
    expect(matrices[5]).toBeCloseTo(0, 6)
    expect(matrices[6]).toBeCloseTo(0, 6)
    expect(matrices[0]).toBeCloseTo(0, 6)
    expect(matrices[2]).toBeCloseTo(0.006, 6)
    expect(matrices[9]).toBeCloseTo(0.006, 6)

    // Third segment of the first loop (index 2): along axis B = +Z, offset -halfA = -0.097 in X.
    //   column 1 = B × length_B = (0, 0, 0.194)
    //   translation = (2 - 0.097, 0.025, 3) = (1.903, 0.025, 3.0)
    const seg2 = 32
    expect(matrices[seg2 + 4]).toBeCloseTo(0, 6)
    expect(matrices[seg2 + 6]).toBeCloseTo(0.194, 6)
    expect(matrices[seg2 + 12]).toBeCloseTo(1.903, 6)
    expect(matrices[seg2 + 14]).toBeCloseTo(3.0, 6)
  })

  it('places a centura stirrup loop horizontally along the wall direction', () => {
    // Centura along +X on a 380mm-thick wall, height 260mm (exterior), 5m long,
    // base at Y = 2.44m (top of a 2.7m wall minus 260mm).
    const placement: CenturaPlacementMm = {
      startXMm: 0,
      startZMm: 0,
      endXMm: 5000,
      endZMm: 0,
      baseYMm: 2440,
      heightMm: 260,
      thicknessMm: 380,
      crossSectionHeightMm: 260,
    }
    const spec: RebarBarSpec = { diameterMm: 6, spacingMm: 150, coverMm: 25, role: 'STIRRUP' }
    const { count, matrices } = generateCenturaStirrupInstances(placement, spec)
    // 34 loops (see stirrup.spec.ts centura case) × 4 segments.
    expect(count).toBe(34 * 4)

    // First loop at positionMm = 25 → world position (25mm along +X from start).
    // Origin (mid-height of centura) at Y = 2.44 + 0.26/2 = 2.57 m.
    // Segment 0: along vertical axis A, offset -halfB (across-thickness).
    //   halfA = 102mm (see stirrup.spec.ts), halfB = 162mm.
    //   axis A = (0,1,0), lengthA = 0.204 m → column 1 = (0, 0.204, 0)
    //   perpendicular across wall p = (-uz, ux) = (0, 0, 1) since wall along +X.
    //   offset by -halfB along B = -0.162 in Z.
    //   translation = (0.025, 2.57, -0.162)
    expect(matrices[4]).toBeCloseTo(0, 6)
    expect(matrices[5]).toBeCloseTo(0.204, 6)
    expect(matrices[6]).toBeCloseTo(0, 6)
    expect(matrices[12]).toBeCloseTo(0.025, 6)
    expect(matrices[13]).toBeCloseTo(2.57, 6)
    expect(matrices[14]).toBeCloseTo(-0.162, 6)

    // Segment 2: along axis B (horizontal, across wall), offset -halfA in vertical.
    //   axis B = (0, 0, 1), lengthB = 0.324 m → column 1 = (0, 0, 0.324)
    //   translation = (0.025, 2.57 - 0.102, 0) = (0.025, 2.468, 0)
    const seg2 = 32
    expect(matrices[seg2 + 4]).toBeCloseTo(0, 6)
    expect(matrices[seg2 + 5]).toBeCloseTo(0, 6)
    expect(matrices[seg2 + 6]).toBeCloseTo(0.324, 6)
    expect(matrices[seg2 + 12]).toBeCloseTo(0.025, 6)
    expect(matrices[seg2 + 13]).toBeCloseTo(2.468, 6)
  })

  it('returns empty result for a non-stirrup role and a zero-length centura', () => {
    const tieColumnPlacement: TieColumnPlacementMm = {
      posXMm: 0,
      posZMm: 0,
      baseYMm: 0,
      lengthMm: 2700,
      crossSectionAMm: 250,
      crossSectionBMm: 250,
    }
    expect(
      generateTieColumnStirrupInstances(tieColumnPlacement, {
        diameterMm: 12,
        spacingMm: 200,
        coverMm: 25,
        role: 'LONGITUDINAL',
      }).count,
    ).toBe(0)
    const zeroCentura: CenturaPlacementMm = {
      startXMm: 0,
      startZMm: 0,
      endXMm: 0,
      endZMm: 0,
      baseYMm: 0,
      heightMm: 260,
      thicknessMm: 380,
      crossSectionHeightMm: 260,
    }
    expect(generateCenturaStirrupInstances(zeroCentura, tieColumnStirrupSpec).count).toBe(0)
  })

  it('composeStirrupInstanceMatrices matches the loop count 1:1 with 4 segments per loop', () => {
    const loops = generateStirrupLayout(
      { lengthMm: 2700, crossSectionAMm: 250, crossSectionBMm: 250 },
      tieColumnStirrupSpec,
    )
    // Frame not aligned with any axis — sanity check the composer stays
    // agnostic of the frame.
    const invSqrt2 = 1 / Math.sqrt(2)
    const frame: StirrupElementFrame = {
      originXMm: 100,
      originYMm: 200,
      originZMm: 300,
      longAxis: { x: 0, y: 1, z: 0 },
      crossAxisA: { x: invSqrt2, y: 0, z: invSqrt2 },
      crossAxisB: { x: -invSqrt2, y: 0, z: invSqrt2 },
    }
    const composed = composeStirrupInstanceMatrices(frame, loops)
    expect(composed.count).toBe(loops.length * 4)
    expect(composed.matrices).toHaveLength(loops.length * 4 * 16)
  })
})
