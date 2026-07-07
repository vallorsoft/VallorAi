import { calculateLongitudinalRebarQuantity, generateLongitudinalRebarLayout } from './rebar'

describe('rebar — longitudinal reinforcement', () => {
  const element = { lengthMm: 1000, widthMm: 300 }
  const spec = { diameterMm: 12, spacingMm: 150, coverMm: 25, role: 'LONGITUDINAL' as const }

  it('matches the standard SR-438-class weight table for a 12mm bar (~0.888 kg/m)', () => {
    const result = calculateLongitudinalRebarQuantity(element, spec)
    // usableWidth = 300 - 50 = 250 -> floor(250/150)+1 = 2 bars
    // barLength = 1000 - 50 = 950mm -> totalLength = 1900mm
    expect(result.barCount).toBe(2)
    expect(result.totalLengthMm).toBe(1900)
    // 1.9m * ~0.888 kg/m ≈ 1.687 kg
    expect(result.totalWeightKg).toBeCloseTo(1.687, 2)
  })

  it('places bars symmetrically across the usable width, respecting cover', () => {
    const layout = generateLongitudinalRebarLayout(element, spec)
    expect(layout).toHaveLength(2)
    expect(layout[0].zMm).toBeCloseTo(spec.coverMm, 5)
    expect(layout[1].zMm).toBeCloseTo(element.widthMm - spec.coverMm, 5)
    for (const bar of layout) {
      expect(bar.lengthMm).toBe(950)
      expect(bar.diameterMm).toBe(12)
    }
  })

  it('falls back to a single centered bar when the usable width is smaller than one spacing step', () => {
    const narrow = { lengthMm: 500, widthMm: 100 }
    const result = calculateLongitudinalRebarQuantity(narrow, spec)
    expect(result.barCount).toBe(1)
    const layout = generateLongitudinalRebarLayout(narrow, spec)
    expect(layout[0].zMm).toBe(50)
  })
})
