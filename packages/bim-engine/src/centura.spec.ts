import {
  deriveCenturaHeightMm,
  deriveCenturaWidthMm,
  deriveCenturaReinforcement,
  deriveCenturaLevels,
  DEFAULT_SLAB_THICKNESS_MM,
  type CenturaWallSegment,
} from './centura'

function wall(
  id: string,
  floor: number,
  thicknessMm: number,
  isExterior: boolean,
  isLoadBearing = true,
): CenturaWallSegment {
  return { id, startX: 0, startY: 0, endX: 5, endY: 0, floor, thicknessMm, isLoadBearing, isExterior }
}

describe('centura — law module 3 (CR6-2013 ring beams)', () => {
  describe('deriveCenturaHeightMm', () => {
    it('is the slab thickness for an interior wall', () => {
      expect(deriveCenturaHeightMm(false)).toBe(DEFAULT_SLAB_THICKNESS_MM)
    })

    it('is double the slab thickness for a perimeter (exterior) wall', () => {
      expect(deriveCenturaHeightMm(true)).toBe(DEFAULT_SLAB_THICKNESS_MM * 2)
    })
  })

  describe('deriveCenturaWidthMm', () => {
    it('matches the wall thickness', () => {
      expect(deriveCenturaWidthMm(380)).toBe(380)
      expect(deriveCenturaWidthMm(250)).toBe(250)
    })
  })

  describe('deriveCenturaReinforcement', () => {
    it('floors at 4xΦ10 for an ordinary interior centură (130x250mm)', () => {
      // area = 130*250 = 32500mm²; 0.5% = 162.5mm²; one Φ10 bar = 78.54mm²;
      // 162.5/78.54 = 2.07 -> ceil = 3 -> floored to the 4-bar minimum.
      // edge spacing = 250 - 2*25 - 10 = 190mm.
      const spec = deriveCenturaReinforcement(130, 250)
      expect(spec.longitudinal).toEqual({ barCount: 4, diameterMm: 10, coverMm: 25, edgeSpacingMm: 190 })
      expect(spec.stirrup).toEqual({ diameterMm: 6, spacingMm: 150, coverMm: 25 })
    })

    it('requires more than 4 bars for a large perimeter centură where the 0.5% ratio exceeds the 4-bar floor', () => {
      // area = 260*600 = 156000mm²; 0.5% = 780mm²; 780/78.54 = 9.93 -> ceil = 10.
      const spec = deriveCenturaReinforcement(260, 600)
      expect(spec.longitudinal.barCount).toBe(10)
    })
  })

  describe('deriveCenturaLevels', () => {
    it('places one centură per load-bearing wall at its own floor, with no extra level for a single-floor house lacking an attic wall set', () => {
      const walls = [wall('a', 0, 380, true), wall('b', 0, 250, false)]
      const placements = deriveCenturaLevels(walls)
      // Both walls are on floor 0 (the topmost floor) -> each also gets a
      // level-1 "above last floor" entry.
      expect(placements).toHaveLength(4)
      const levels = placements.map((p) => p.level).sort()
      expect(levels).toEqual([0, 0, 1, 1])
    })

    it('gives an exterior wall double the height of an interior wall at the same level', () => {
      const walls = [wall('ext', 0, 380, true), wall('int', 0, 250, false)]
      const placements = deriveCenturaLevels(walls)
      const ext = placements.find((p) => p.wallId === 'ext' && p.level === 0)!
      const int = placements.find((p) => p.wallId === 'int' && p.level === 0)!
      expect(ext.heightMm).toBe(int.heightMm * 2)
      expect(ext.widthMm).toBe(380)
      expect(int.widthMm).toBe(250)
    })

    it('only adds the above-top-floor entry for walls actually on the topmost floor, for a 2-floor house', () => {
      const walls = [wall('ground', 0, 380, true), wall('upper', 1, 380, true)]
      const placements = deriveCenturaLevels(walls)
      // ground: level 0 only. upper: level 1 (its own) + level 2 (above top floor).
      expect(placements.filter((p) => p.wallId === 'ground')).toHaveLength(1)
      expect(placements.filter((p) => p.wallId === 'ground')[0].level).toBe(0)
      const upperLevels = placements.filter((p) => p.wallId === 'upper').map((p) => p.level).sort()
      expect(upperLevels).toEqual([1, 2])
    })

    it('ignores non-load-bearing (partition) walls', () => {
      const walls = [wall('p', 0, 100, false, false)]
      expect(deriveCenturaLevels(walls)).toHaveLength(0)
    })

    it('returns an empty list for no walls', () => {
      expect(deriveCenturaLevels([])).toHaveLength(0)
    })
  })
})
