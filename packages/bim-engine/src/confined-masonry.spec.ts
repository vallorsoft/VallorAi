import {
  detectCornerAndIntersectionPoints,
  detectMidSpanTieColumns,
  detectOpeningTieColumns,
  deriveTieColumnPlacements,
  deriveTieColumnReinforcement,
  deriveLintelSpec,
  openingConfinementThresholdSqm,
  MAX_TIE_COLUMN_SPACING_M,
  type WallSegment,
  type WallOpeningForConfinement,
} from './confined-masonry'

function wall(
  id: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  isLoadBearing = true,
): WallSegment {
  return { id, startX, startY, endX, endY, isLoadBearing }
}

describe('confined-masonry — law module 2 (CR6-2013 stâlpișori + buiandrug)', () => {
  describe('detectCornerAndIntersectionPoints', () => {
    it('places S1 at every corner of a closed rectangle (4 walls, 4 corners)', () => {
      // 6x4m rectangle.
      const walls = [
        wall('n', 0, 0, 6, 0),
        wall('e', 6, 0, 6, 4),
        wall('s', 6, 4, 0, 4),
        wall('w', 0, 4, 0, 0),
      ]
      const points = detectCornerAndIntersectionPoints(walls)
      expect(points).toHaveLength(4)
      const coords = points.map((p) => `${p.x},${p.y}`).sort()
      expect(coords).toEqual(['0,0', '0,4', '6,0', '6,4'].sort())
    })

    it('does NOT place a column at a plain door/window jamb (no opening concept touches this function at all)', () => {
      // A single wall with no other wall nearby — no corners, regardless of
      // any opening that might exist on it (openings never enter this
      // geometry function — that is exactly last session's correction).
      const walls = [wall('a', 0, 0, 8, 0)]
      expect(detectCornerAndIntersectionPoints(walls)).toHaveLength(0)
    })

    it('does not place a column at a straight (collinear) join of two collinear wall rows', () => {
      // One physical 10m wall split into two DB rows at x=5.
      const walls = [wall('a', 0, 0, 5, 0), wall('b', 5, 0, 10, 0)]
      expect(detectCornerAndIntersectionPoints(walls)).toHaveLength(0)
    })

    it('places S1 at a T-junction where a partition meets an exterior wall mid-span', () => {
      const walls = [
        wall('n', 0, 0, 10, 0),
        wall('e', 10, 0, 10, 6),
        wall('s', 10, 6, 0, 6),
        wall('w', 0, 6, 0, 0),
        // Interior partition from the north wall's midpoint straight down.
        wall('p', 5, 0, 5, 6),
      ]
      const points = detectCornerAndIntersectionPoints(walls)
      // 4 corners + 2 T-junctions (partition meets north wall, meets south wall).
      expect(points).toHaveLength(6)
      expect(points.some((p) => p.x === 5 && p.y === 0)).toBe(true)
      expect(points.some((p) => p.x === 5 && p.y === 6)).toBe(true)
    })

    it('places S1 at a 3-way (X/Y) intersection', () => {
      const walls = [
        wall('a', 0, 5, 10, 5),
        wall('b', 5, 0, 5, 10),
        wall('c', 5, 5, 5, 10), // shares an endpoint with a and b at (5,5)
      ]
      const points = detectCornerAndIntersectionPoints(walls)
      expect(points.some((p) => Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y - 5) < 1e-6)).toBe(true)
    })

    it('ignores non-load-bearing walls entirely', () => {
      const walls = [
        wall('n', 0, 0, 6, 0, false),
        wall('e', 6, 0, 6, 4, false),
        wall('s', 6, 4, 0, 4, false),
        wall('w', 0, 4, 0, 0, false),
      ]
      expect(detectCornerAndIntersectionPoints(walls)).toHaveLength(0)
    })

    it('is tolerant of near-but-not-exact-matching endpoints (drawing snap slop)', () => {
      const walls = [wall('a', 0, 0, 5, 0), wall('b', 5.01, 0, 5, 5)]
      const points = detectCornerAndIntersectionPoints(walls)
      expect(points).toHaveLength(1)
    })
  })

  describe('detectMidSpanTieColumns (S2)', () => {
    it('adds no intermediate columns for a wall shorter than the max spacing', () => {
      const walls = [wall('a', 0, 0, 3.5, 0)]
      expect(detectMidSpanTieColumns(walls)).toHaveLength(0)
    })

    it('adds one evenly-centered column for a wall just over the max spacing', () => {
      // 4.5m wall -> ceil(4.5/4) = 2 segments -> 1 midpoint at 2.25m.
      const walls = [wall('a', 0, 0, 4.5, 0)]
      const points = detectMidSpanTieColumns(walls)
      expect(points).toHaveLength(1)
      expect(points[0].x).toBeCloseTo(2.25, 6)
      expect(points[0].y).toBeCloseTo(0, 6)
    })

    it('keeps every gap at or under the max spacing for a long wall', () => {
      const walls = [wall('a', 0, 0, 13, 0)] // -> ceil(13/4) = 4 segments
      const points = detectMidSpanTieColumns(walls).sort((a, b) => a.x - b.x)
      expect(points).toHaveLength(3)
      const xs = [0, ...points.map((p) => p.x), 13]
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(MAX_TIE_COLUMN_SPACING_M + 1e-9)
      }
    })

    it('works along a diagonal wall too (not just axis-aligned)', () => {
      // 3-4-5 triangle scaled up: length 10.
      const walls = [wall('a', 0, 0, 6, 8)]
      const points = detectMidSpanTieColumns(walls)
      expect(points).toHaveLength(2) // ceil(10/4)=3 segments -> 2 midpoints
      for (const p of points) {
        // Must lie exactly on the wall line.
        const t = p.x / 6
        expect(p.y).toBeCloseTo(8 * t, 6)
      }
    })
  })

  describe('deriveTieColumnPlacements', () => {
    it('combines S1 corners and S2 mid-span points for a long rectangle, deduplicated', () => {
      // 9x3m rectangle: the two long (9m) walls each need ceil(9/4)=3
      // segments -> 2 evenly-spaced S2 midpoints at 3m and 6m.
      const walls = [
        wall('n', 0, 0, 9, 0),
        wall('e', 9, 0, 9, 3),
        wall('s', 9, 3, 0, 3),
        wall('w', 0, 3, 0, 0),
      ]
      const placements = deriveTieColumnPlacements(walls)
      const s1 = placements.filter((p) => p.category === 'S1')
      const s2 = placements.filter((p) => p.category === 'S2')
      expect(s1).toHaveLength(4)
      expect(s2).toHaveLength(4)
      expect(s2.some((p) => p.x === 3 && p.y === 0)).toBe(true)
      expect(s2.some((p) => p.x === 6 && p.y === 0)).toBe(true)
      expect(s2.some((p) => p.x === 3 && p.y === 3)).toBe(true)
      expect(s2.some((p) => p.x === 6 && p.y === 3)).toBe(true)
    })

    it('adds S3 columns at both jambs of a large opening, in a high-seismic zone', () => {
      // One 6m load-bearing wall, no corners; a 2.0x1.5m = 3.0 m² window
      // starting 2m from the wall's start. In a red zone (ag=0.30g) the
      // threshold is 1.5 m², so this opening is confined at both jambs.
      const walls = [wall('n', 0, 0, 6, 0)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'n', position: 2, width: 2, areaSqm: 3.0 },
      ]
      const placements = deriveTieColumnPlacements(walls, openings, 0.3)
      const s3 = placements.filter((p) => p.category === 'S3')
      expect(s3).toHaveLength(2)
      expect(s3.some((p) => p.x === 2 && p.y === 0)).toBe(true) // near jamb
      expect(s3.some((p) => p.x === 4 && p.y === 0)).toBe(true) // far jamb (2 + 2)
    })

    it('places no S3 column for a below-threshold opening', () => {
      // Same wall, a small 1.2x1.2 = 1.44 m² window — under the 1.5 m²
      // red-zone threshold, so no confinement column.
      const walls = [wall('n', 0, 0, 6, 0)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'n', position: 2, width: 1.2, areaSqm: 1.44 },
      ]
      const placements = deriveTieColumnPlacements(walls, openings, 0.3)
      expect(placements.filter((p) => p.category === 'S3')).toHaveLength(0)
    })

    it('applies the looser 2.5 m² threshold in a low-seismic zone', () => {
      // A 2.0 m² opening: confined at ag=0.30g (>=1.5), NOT at ag=0.10g
      // (<2.5).
      const walls = [wall('n', 0, 0, 6, 0)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'n', position: 2, width: 1.6, areaSqm: 2.0 },
      ]
      expect(
        deriveTieColumnPlacements(walls, openings, 0.3).filter((p) => p.category === 'S3'),
      ).toHaveLength(2)
      expect(
        deriveTieColumnPlacements(walls, openings, 0.1).filter((p) => p.category === 'S3'),
      ).toHaveLength(0)
    })

    it('does not double-place an S3 jamb that coincides with an S1 corner', () => {
      // A 4m wall meeting another at the origin (a corner -> S1 at 0,0),
      // with a large opening whose near jamb sits exactly at that corner.
      const walls = [wall('n', 0, 0, 4, 0), wall('w', 0, 0, 0, 4)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'n', position: 0, width: 2, areaSqm: 3.0 },
      ]
      const placements = deriveTieColumnPlacements(walls, openings, 0.3)
      const atOrigin = placements.filter((p) => p.x === 0 && p.y === 0)
      expect(atOrigin).toHaveLength(1)
      expect(atOrigin[0].category).toBe('S1')
      // The far jamb (2,0) is still an S3 column.
      expect(placements.some((p) => p.category === 'S3' && p.x === 2 && p.y === 0)).toBe(true)
    })

    it('ignores openings on non-load-bearing walls', () => {
      const walls = [wall('partition', 0, 0, 6, 0, false)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'partition', position: 2, width: 2, areaSqm: 3.0 },
      ]
      expect(deriveTieColumnPlacements(walls, openings, 0.3)).toHaveLength(0)
    })

    it('reproduces the S1+S2-only result when no openings are passed', () => {
      const walls = [
        wall('n', 0, 0, 9, 0),
        wall('e', 9, 0, 9, 3),
        wall('s', 9, 3, 0, 3),
        wall('w', 0, 3, 0, 0),
      ]
      expect(deriveTieColumnPlacements(walls)).toEqual(deriveTieColumnPlacements(walls, [], 0.3))
    })
  })

  describe('detectOpeningTieColumns / openingConfinementThresholdSqm', () => {
    it('uses 1.5 m² at/above 0.25g and 2.5 m² below', () => {
      expect(openingConfinementThresholdSqm(0.25)).toBe(1.5)
      expect(openingConfinementThresholdSqm(0.3)).toBe(1.5)
      expect(openingConfinementThresholdSqm(0.2)).toBe(2.5)
      expect(openingConfinementThresholdSqm(0.1)).toBe(2.5)
    })

    it('computes jamb points along a diagonal wall correctly', () => {
      // Wall from (0,0) to (0,10): a vertical wall. Opening near jamb at 3m,
      // width 2m -> jambs at (0,3) and (0,5).
      const walls = [wall('v', 0, 0, 0, 10)]
      const openings: WallOpeningForConfinement[] = [
        { wallId: 'v', position: 3, width: 2, areaSqm: 3.0 },
      ]
      const points = detectOpeningTieColumns(walls, openings, 0.3)
      expect(points).toHaveLength(2)
      expect(points).toContainEqual({ x: 0, y: 3 })
      expect(points).toContainEqual({ x: 0, y: 5 })
    })
  })

  describe('deriveTieColumnReinforcement', () => {
    it('returns the CR6-2013 constructive minimums (conservative 4xΦ14 regardless of seismic zone)', () => {
      expect(deriveTieColumnReinforcement()).toEqual({
        // 250 - 2*25 - 14 = 186mm clear edge spacing between corner bars.
        longitudinal: { barCount: 4, diameterMm: 14, coverMm: 25, edgeSpacingMm: 186 },
        stirrup: { diameterMm: 6, spacingMm: 150, coverMm: 25 },
      })
    })
  })

  describe('deriveLintelSpec', () => {
    it('adds the 250mm bearing on each side and matches the wall thickness', () => {
      const spec = deriveLintelSpec(900, 380) // 900mm door, 380mm Leier wall
      expect(spec).toEqual({
        lengthMm: 900 + 2 * 250,
        widthMm: 380,
        bearingLengthMm: 250,
        prefabricated: true,
      })
    })
  })
})
