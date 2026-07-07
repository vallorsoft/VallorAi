import { composeBrickInstanceMatrices, generateWallBrickInstances } from './instancing'
import { generateBrickLayout } from './masonry'
import type { BrickModule, WallPlacementMm } from './index'

// STAS 2945/73 solid brick with NE 001/1996 joints — same reference module as
// masonry.spec.ts, so the layout part is already covered there; these tests
// pin down the matrix composition on top of it.
const solidBrick: BrickModule = {
  lengthMm: 240,
  heightMm: 63,
  widthMm: 115,
  bedJointMm: 12,
  headJointMm: 10,
}

// 500mm long, 75mm high (exactly one 63+12 course) → course 0 only:
// brick 1 center x=120 (whole), brick 2 center x=370 (whole), cursor then
// reaches 500 and the loop ends. Hand-checked against masonry.ts.
const shortWall: WallPlacementMm = {
  startXMm: 0,
  startZMm: 0,
  endXMm: 500,
  endZMm: 0,
  baseYMm: 0,
  heightMm: 75,
  thicknessMm: 115,
}

describe('composeBrickInstanceMatrices', () => {
  it('produces one column-major matrix per brick, in meters, for an X-aligned wall', () => {
    const layout = generateBrickLayout(
      { lengthMm: 500, heightMm: 75, thicknessMm: 115 },
      solidBrick,
    )
    const result = composeBrickInstanceMatrices(shortWall, layout)

    expect(result.count).toBe(2)
    expect(result.matrices).toHaveLength(2 * 16)
    expect(Array.from(result.cutFlags)).toEqual([0, 0])

    // First brick: scale = brick dims in m, no rotation (cos=1, sin=0),
    // center at (0.120, 0.0315, 0) — yMm = 63/2 = 31.5.
    const m = Array.from(result.matrices.slice(0, 16))
    expect(m[0]).toBeCloseTo(0.24, 6) // cos*sx
    expect(m[2]).toBeCloseTo(0, 6) // -sin*sx
    expect(m[5]).toBeCloseTo(0.063, 6) // sy
    expect(m[8]).toBeCloseTo(0, 6) // sin*sz
    expect(m[10]).toBeCloseTo(0.115, 6) // cos*sz
    expect(m[12]).toBeCloseTo(0.12, 6) // tx
    expect(m[13]).toBeCloseTo(0.0315, 6) // ty
    expect(m[14]).toBeCloseTo(0, 6) // tz
    expect(m[15]).toBe(1)

    // Second brick sits one module (240+10) further along X.
    const m2 = Array.from(result.matrices.slice(16, 32))
    expect(m2[12]).toBeCloseTo(0.37, 6)
  })

  it('rotates the brick length axis onto a Z-aligned wall and applies the wall origin + base elevation', () => {
    const placement: WallPlacementMm = {
      startXMm: 2000,
      startZMm: 3000,
      endXMm: 2000,
      endZMm: 3500,
      baseYMm: 100,
      heightMm: 75,
      thicknessMm: 115,
    }
    const layout = generateBrickLayout(
      { lengthMm: 500, heightMm: 75, thicknessMm: 115 },
      solidBrick,
    )
    const result = composeBrickInstanceMatrices(placement, layout)

    // Wall direction +Z: rotationY = -atan2(1, 0) → cos=0, sin=-1.
    // Local X (brick length) must map to world +Z: column 0 = (0, 0, 0.24).
    const m = Array.from(result.matrices.slice(0, 16))
    expect(m[0]).toBeCloseTo(0, 6)
    expect(m[2]).toBeCloseTo(0.24, 6)
    // Local Z (brick width) maps to world -X: column 2 = (-0.115, 0, 0).
    expect(m[8]).toBeCloseTo(-0.115, 6)
    expect(m[10]).toBeCloseTo(0, 6)
    // Center: 120mm along +Z from the start point, elevated by baseY + h/2.
    expect(m[12]).toBeCloseTo(2.0, 6)
    expect(m[13]).toBeCloseTo(0.1 + 0.0315, 6)
    expect(m[14]).toBeCloseTo(3.12, 6)
  })

  it('flags cut bricks from the layout', () => {
    // Two courses: course 1 leads with a running-bond half brick (isCut).
    const placement: WallPlacementMm = { ...shortWall, heightMm: 150 }
    const layout = generateBrickLayout(
      { lengthMm: 500, heightMm: 150, thicknessMm: 115 },
      solidBrick,
    )
    const result = composeBrickInstanceMatrices(placement, layout)
    const cutCount = result.cutFlags.reduce<number>((sum, flag) => sum + flag, 0)
    expect(cutCount).toBeGreaterThan(0)
    expect(result.count).toBe(layout.length)
  })
})

describe('generateWallBrickInstances', () => {
  it('matches layout generation + composition end to end', () => {
    const direct = generateWallBrickInstances(shortWall, solidBrick)
    const layout = generateBrickLayout(
      { lengthMm: 500, heightMm: 75, thicknessMm: 115 },
      solidBrick,
    )
    const composed = composeBrickInstanceMatrices(shortWall, layout)
    expect(direct.count).toBe(composed.count)
    expect(Array.from(direct.matrices)).toEqual(Array.from(composed.matrices))
  })

  it('returns an empty result for a zero-length wall', () => {
    const degenerate: WallPlacementMm = { ...shortWall, endXMm: 0 }
    const result = generateWallBrickInstances(degenerate, solidBrick)
    expect(result.count).toBe(0)
    expect(result.matrices).toHaveLength(0)
  })
})
