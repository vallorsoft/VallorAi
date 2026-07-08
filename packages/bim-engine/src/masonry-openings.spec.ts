import { calculateBrickQuantity, generateBrickLayout } from './masonry'
import type { BrickModule, WallDimensions, WallOpeningMm, BrickInstanceTransform } from './types'

// Opening-aware coursing (BIM-detail step 7): all reference values below are
// hand-calculated from the STAS 2945/73 solid brick module — 240mm length +
// 10mm head joint = 250mm module, 63mm height + 12mm bed joint = 75mm course.

const solidBrick: BrickModule = {
  lengthMm: 240,
  heightMm: 63,
  widthMm: 115,
  bedJointMm: 12,
  headJointMm: 10,
}

function bounds(b: BrickInstanceTransform) {
  return {
    x0: b.xMm - b.lengthMm / 2,
    x1: b.xMm + b.lengthMm / 2,
    y0: b.yMm - b.heightMm / 2,
    y1: b.yMm + b.heightMm / 2,
  }
}

function intersectsOpening(b: BrickInstanceTransform, o: WallOpeningMm): boolean {
  const r = bounds(b)
  const tol = 0.001
  return (
    r.x1 > o.positionMm + tol &&
    r.x0 < o.positionMm + o.widthMm - tol &&
    r.y1 > o.sillHeightMm + tol &&
    r.y0 < o.sillHeightMm + o.heightMm - tol
  )
}

describe('masonry — opening-aware coursing (step 7)', () => {
  it('produces an identical layout to the opening-free algorithm when no openings are passed', () => {
    const wall: WallDimensions = { lengthMm: 3000, heightMm: 2500, thicknessMm: 380 }
    expect(generateBrickLayout(wall, solidBrick, [])).toEqual(generateBrickLayout(wall, solidBrick))
  })

  describe('door opening (sill at 0)', () => {
    // 1000×750 wall (10 courses of 75mm); door at x∈[250,500], y∈[0,450].
    // The door top (450) lands exactly on the course-6 bed joint line
    // (6×75 = 450), so courses 0–5 are blocked across the door and courses
    // 6–9 run the full wall — no height-cut lintel strip needed.
    const wall: WallDimensions = { lengthMm: 1000, heightMm: 750, thicknessMm: 115 }
    const door: WallOpeningMm = { positionMm: 250, widthMm: 250, heightMm: 450, sillHeightMm: 0 }
    const layout = generateBrickLayout(wall, solidBrick, [door])

    it('no brick piece intrudes into the opening rectangle', () => {
      for (const piece of layout) {
        expect(intersectsOpening(piece, door)).toBe(false)
      }
    })

    it('anchors the right-jamb segment with a full brick on even courses and a half brick on odd courses', () => {
      const rightOf = (course: number) =>
        layout
          .filter((b) => b.course === course && b.xMm > 500)
          .sort((a, b) => a.xMm - b.xMm)

      // Course 0 (even): whole 240mm module laid against the jamb at x=500.
      const c0 = rightOf(0)
      expect(c0[0]).toMatchObject({ lengthMm: 240, xMm: 620, isCut: false })
      // Course 1 (odd): 120mm half brick against the jamb — bond staggered
      // from the opening, per P2-85 (joints of adjacent courses offset).
      const c1 = rightOf(1)
      expect(c1[0]).toMatchObject({ lengthMm: 120, xMm: 560, isCut: true })
    })

    it('anchors the left segment from its right (jamb) side, pushing the cut to the wall end', () => {
      // Left segment x∈[0,250]. Course 0: one whole 240mm brick ends at the
      // jamb (x∈[10,250]) — the 10mm remainder at the wall start is smaller
      // than a minimum cut and reads as mortar.
      const c0 = layout.filter((b) => b.course === 0 && b.xMm < 250)
      expect(c0).toHaveLength(1)
      expect(c0[0]).toMatchObject({ lengthMm: 240, xMm: 130 })
      // Course 1: 120mm half brick at the jamb (x∈[130,250]), then a cut
      // 120mm piece fills toward the wall start (x∈[0,120]).
      const c1 = layout
        .filter((b) => b.course === 1 && b.xMm < 250)
        .sort((a, b) => b.xMm - a.xMm)
      expect(c1[0]).toMatchObject({ lengthMm: 120, xMm: 190, isCut: true })
      expect(c1[1]).toMatchObject({ lengthMm: 120, xMm: 60, isCut: true })
    })

    it('runs full uninterrupted courses above the door head', () => {
      const c6 = layout.filter((b) => b.course === 6)
      // Same as an opening-free even course of a 1000mm wall: 4 whole bricks.
      expect(c6).toHaveLength(4)
      expect(c6.every((b) => !b.isCut && b.lengthMm === 240)).toBe(true)
    })

    it('reduces the purchased-module quantity versus the solid wall', () => {
      const withDoor = calculateBrickQuantity(wall, solidBrick, [door])
      const solid = calculateBrickQuantity(wall, solidBrick)
      expect(withDoor.courseCount).toBe(solid.courseCount)
      // Blocked courses 0–5: ceil(250/250) + ceil(500/250) = 3 modules each;
      // free courses 6–9: 4 modules each → 6×3 + 4×4 = 34 (solid wall: 40).
      expect(solid.wholeBrickCount).toBe(40)
      expect(withDoor.wholeBrickCount).toBe(34)
    })
  })

  describe('window opening (sill and head crossing mid-course)', () => {
    // 2000×750 wall; window x∈[750,1250], y∈[250,550].
    // Course 3 spans y∈[225,288] → sill line (250) crosses it: 25mm-high
    // strip below the sill. Course 7 spans y∈[525,588] → head line (550)
    // crosses it: 38mm-high lintel-soffit strip above the head.
    const wall: WallDimensions = { lengthMm: 2000, heightMm: 750, thicknessMm: 115 }
    const window: WallOpeningMm = { positionMm: 750, widthMm: 500, heightMm: 300, sillHeightMm: 250 }
    const layout = generateBrickLayout(wall, solidBrick, [window])

    it('no brick piece intrudes into the opening rectangle', () => {
      for (const piece of layout) {
        expect(intersectsOpening(piece, window)).toBe(false)
      }
    })

    it('cuts a 25mm-high strip under the sill, flagged as cut, spanning the window width', () => {
      const strips = layout.filter((b) => b.course === 3 && b.heightMm < solidBrick.heightMm)
      expect(strips.length).toBeGreaterThan(0)
      for (const s of strips) {
        expect(s.heightMm).toBeCloseTo(25, 5)
        expect(s.yMm).toBeCloseTo(225 + 12.5, 5) // course bottom 225 + half strip
        expect(s.isCut).toBe(true)
        const r = bounds(s)
        expect(r.x0).toBeGreaterThanOrEqual(750 - 0.001)
        expect(r.x1).toBeLessThanOrEqual(1250 + 0.001)
      }
      // The strip run fills the window width: first piece starts at the jamb.
      const sorted = strips.sort((a, b) => a.xMm - b.xMm)
      expect(bounds(sorted[0]).x0).toBeCloseTo(750, 5)
    })

    it('cuts a 38mm-high lintel-soffit strip above the head', () => {
      const strips = layout.filter((b) => b.course === 7 && b.heightMm < solidBrick.heightMm)
      expect(strips.length).toBeGreaterThan(0)
      for (const s of strips) {
        expect(s.heightMm).toBeCloseTo(38, 5)
        expect(s.yMm).toBeCloseTo(550 + 19, 5) // head 550 + half strip
        expect(s.isCut).toBe(true)
      }
    })

    it('fully blocks the courses inside the window band and resumes full courses above', () => {
      // Courses 4–6 (y from 300 to 513) sit entirely inside the window band.
      for (const course of [4, 5, 6]) {
        const inside = layout.filter(
          (b) => b.course === course && bounds(b).x1 > 750 && bounds(b).x0 < 1250,
        )
        expect(inside).toHaveLength(0)
      }
      // Courses 8–9 are above the head — plain full-width running bond again.
      const c8 = layout.filter((b) => b.course === 8)
      expect(c8).toHaveLength(8) // 2000mm / 250mm module = 8 whole bricks
      expect(c8.every((b) => !b.isCut)).toBe(true)
    })

    it('keeps every piece inside the wall bounds', () => {
      for (const piece of layout) {
        const r = bounds(piece)
        expect(r.x0).toBeGreaterThanOrEqual(-0.001)
        expect(r.x1).toBeLessThanOrEqual(wall.lengthMm + 0.001)
        expect(r.y0).toBeGreaterThanOrEqual(-0.001)
        expect(r.y1).toBeLessThanOrEqual(wall.heightMm + 0.001)
      }
    })
  })

  describe('two openings on one wall', () => {
    const wall: WallDimensions = { lengthMm: 4000, heightMm: 750, thicknessMm: 115 }
    const door: WallOpeningMm = { positionMm: 500, widthMm: 250, heightMm: 450, sillHeightMm: 0 }
    const window: WallOpeningMm = {
      positionMm: 2500,
      widthMm: 500,
      heightMm: 300,
      sillHeightMm: 250,
    }
    const layout = generateBrickLayout(wall, solidBrick, [door, window])

    it('no piece intrudes into either opening', () => {
      for (const piece of layout) {
        expect(intersectsOpening(piece, door)).toBe(false)
        expect(intersectsOpening(piece, window)).toBe(false)
      }
    })

    it('anchors the between-openings segment from the door jamb (left anchor wins)', () => {
      // Course 0 middle segment x∈[750,2500]: left-anchored at the door's
      // right jamb → first piece is a whole brick starting exactly at 750.
      const middle = layout
        .filter((b) => b.course === 0 && b.xMm > 750 && b.xMm < 2500)
        .sort((a, b) => a.xMm - b.xMm)
      expect(bounds(middle[0]).x0).toBeCloseTo(750, 5)
      expect(middle[0].lengthMm).toBe(240)
    })
  })

  it('ignores degenerate or fully-out-of-bounds openings', () => {
    const wall: WallDimensions = { lengthMm: 1000, heightMm: 750, thicknessMm: 115 }
    const degenerate: WallOpeningMm[] = [
      { positionMm: 100, widthMm: 0, heightMm: 400, sillHeightMm: 0 },
      { positionMm: 2000, widthMm: 300, heightMm: 400, sillHeightMm: 0 },
      { positionMm: 100, widthMm: 200, heightMm: 0, sillHeightMm: 100 },
    ]
    expect(generateBrickLayout(wall, solidBrick, degenerate)).toEqual(
      generateBrickLayout(wall, solidBrick),
    )
  })
})
