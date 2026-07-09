import {
  calculateStirrupCount,
  calculateStirrupQuantity,
  generateStirrupLayout,
  type StirrupElementDimensions,
} from './stirrup'
import type { RebarBarSpec } from './types'

// Reference: CR6-2013 constructive-minimum tie-column stirrup (Φ6 @ 150mm,
// 25mm cover) on a 250×250mm cross-section, LEVEL_HEIGHT_M-tall column
// (2700mm — matches the 3D viewer's placeholder storey height).
const tieColumnStirrupSpec: RebarBarSpec = {
  diameterMm: 6,
  spacingMm: 150,
  coverMm: 25,
  role: 'STIRRUP',
}
const tieColumnElement: StirrupElementDimensions = {
  lengthMm: 2700,
  crossSectionAMm: 250,
  crossSectionBMm: 250,
}

describe('stirrup — pure layout for a confining element (step 9)', () => {
  it('places one loop per spacing step along the element length, first at cover from the end', () => {
    // Usable length = 2700 - 2×25 = 2650mm → floor(2650/150) + 1 = 18 loops.
    expect(calculateStirrupCount(tieColumnElement, tieColumnStirrupSpec)).toBe(18)

    const loops = generateStirrupLayout(tieColumnElement, tieColumnStirrupSpec)
    expect(loops).toHaveLength(18)
    expect(loops[0].positionMm).toBe(25)
    expect(loops[1].positionMm).toBe(175)
    expect(loops[17].positionMm).toBe(25 + 17 * 150)
    expect(loops[17].positionMm).toBeLessThanOrEqual(tieColumnElement.lengthMm - tieColumnStirrupSpec.coverMm)
  })

  it('shrinks the loop rectangle by cover + half-diameter on every side', () => {
    // Bar centerline sits at 25 + 6/2 = 28mm inside the concrete face,
    // so the half-extent from element centerline to bar centerline is
    // 125 - 28 = 97mm on a 250×250 cross-section.
    const [loop] = generateStirrupLayout(tieColumnElement, tieColumnStirrupSpec)
    expect(loop.halfAMm).toBeCloseTo(97, 6)
    expect(loop.halfBMm).toBeCloseTo(97, 6)
    expect(loop.diameterMm).toBe(6)
  })

  it('handles a centura cross-section (varying axis A × axis B)', () => {
    // Exterior centură on a 380mm wall, height = 2×130 = 260mm (see centura.ts).
    const centuraElement: StirrupElementDimensions = {
      lengthMm: 5000,
      crossSectionAMm: 260, // vertical height
      crossSectionBMm: 380, // horizontal width = wall thickness
    }
    const spec: RebarBarSpec = {
      diameterMm: 6,
      spacingMm: 150,
      coverMm: 25,
      role: 'STIRRUP',
    }
    // Usable = 5000 - 50 = 4950 → floor(4950/150) + 1 = 34 loops.
    expect(calculateStirrupCount(centuraElement, spec)).toBe(34)
    const [loop] = generateStirrupLayout(centuraElement, spec)
    // A: 130 - 28 = 102; B: 190 - 28 = 162.
    expect(loop.halfAMm).toBeCloseTo(102, 6)
    expect(loop.halfBMm).toBeCloseTo(162, 6)
  })

  it('returns an empty layout when cross-section is smaller than 2×(cover + Ø/2)', () => {
    const spec: RebarBarSpec = { diameterMm: 6, spacingMm: 150, coverMm: 25, role: 'STIRRUP' }
    const tooThin: StirrupElementDimensions = {
      lengthMm: 2000,
      crossSectionAMm: 55, // 55/2 - 25 - 3 = -0.5 < 0
      crossSectionBMm: 100,
    }
    expect(generateStirrupLayout(tooThin, spec)).toEqual([])
  })

  it('returns an empty layout when element length is entirely inside the cover zone', () => {
    const tiny: StirrupElementDimensions = { lengthMm: 40, crossSectionAMm: 250, crossSectionBMm: 250 }
    expect(calculateStirrupCount(tiny, tieColumnStirrupSpec)).toBe(0)
    expect(generateStirrupLayout(tiny, tieColumnStirrupSpec)).toEqual([])
  })

  it('quantity: loopCount × perimeter, weight from steel density and bar diameter', () => {
    const q = calculateStirrupQuantity(tieColumnElement, tieColumnStirrupSpec)
    // 18 loops × 4 × (97 + 97) = 18 × 776 = 13968 mm.
    expect(q.loopCount).toBe(18)
    expect(q.totalLengthMm).toBeCloseTo(13968, 6)
    // Ø6 weight per meter = π × (0.003)² × 7850 ≈ 0.222 kg/m.
    // 13.968 m × 0.222 ≈ 3.10 kg.
    expect(q.totalWeightKg).toBeGreaterThan(3.0)
    expect(q.totalWeightKg).toBeLessThan(3.2)
  })
})
