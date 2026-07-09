import {
  classifyRoomZone,
  solveFloorPlan,
  TARGET_ENVELOPE_ASPECT,
  MIN_CORRIDOR_WIDTH_M,
  type SolverRoomInput,
} from './floor-plan'

describe('floor-plan — classifyRoomZone', () => {
  it('maps common RO/EN/HU room-type strings to the intended zone', () => {
    expect(classifyRoomZone('LIVING_ROOM')).toBe('PUBLIC')
    expect(classifyRoomZone('living_room_and_kitchen')).toBe('PUBLIC')
    expect(classifyRoomZone('BEDROOM')).toBe('PRIVATE')
    expect(classifyRoomZone('master_bedroom')).toBe('PRIVATE')
    expect(classifyRoomZone('dormitor')).toBe('PRIVATE')
    expect(classifyRoomZone('halo')).toBe('PRIVATE')
    expect(classifyRoomZone('BATHROOM')).toBe('SERVICE')
    expect(classifyRoomZone('baie')).toBe('SERVICE')
    expect(classifyRoomZone('furdo')).toBe('SERVICE')
    expect(classifyRoomZone('CORRIDOR')).toBe('CIRCULATION')
    expect(classifyRoomZone('folyoso')).toBe('CIRCULATION')
    expect(classifyRoomZone('TERRACE')).toBe('EXTERIOR')
    expect(classifyRoomZone('garaj')).toBe('EXTERIOR')
  })

  it('falls back to SERVICE (least-visible zone) for unknown types', () => {
    expect(classifyRoomZone('WHATSIT_XYZ')).toBe('SERVICE')
  })
})

describe('floor-plan — solveFloorPlan', () => {
  const noOverlap = (rooms: ReturnType<typeof solveFloorPlan>) => {
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]
        const b = rooms[j]
        if (a.floor !== b.floor) continue
        const overlapX = a.posX < b.posX + b.widthM && b.posX < a.posX + a.widthM
        const overlapY = a.posY < b.posY + b.depthM && b.posY < a.posY + a.depthM
        if (overlapX && overlapY) return false
      }
    }
    return true
  }

  it('returns [] for an empty input', () => {
    expect(solveFloorPlan([])).toEqual([])
  })

  it('a single indoor room gets the whole envelope', () => {
    const rooms: SolverRoomInput[] = [{ id: 'r1', type: 'LIVING_ROOM', floor: 0, area: 20 }]
    const solved = solveFloorPlan(rooms)
    expect(solved).toHaveLength(1)
    expect(solved[0].id).toBe('r1')
    expect(solved[0].posX).toBe(0)
    expect(solved[0].posY).toBe(0)
    // envelope: 20*1.4=28 → w = sqrt(28) ≈ 5.29, d = 20/5.29 ≈ 3.78
    expect(solved[0].widthM).toBeCloseTo(Math.sqrt(20 * TARGET_ENVELOPE_ASPECT), 1)
    expect(solved[0].depthM).toBeCloseTo(20 / Math.sqrt(20 * TARGET_ENVELOPE_ASPECT), 1)
  })

  it('a 4-room house partitions non-overlapping inside the envelope, public on the +Y edge', () => {
    // Total 62 m² → envelope ≈ 9.32×6.65 m.
    const rooms: SolverRoomInput[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, area: 22 },
      { id: 'kit', type: 'KITCHEN', floor: 0, area: 12 },
      { id: 'bed', type: 'BEDROOM', floor: 0, area: 18 },
      { id: 'bath', type: 'BATHROOM', floor: 0, area: 10 },
    ]
    const solved = solveFloorPlan(rooms)
    expect(solved).toHaveLength(4)
    expect(noOverlap(solved)).toBe(true)

    // Every solved room's area matches its input, within rounding.
    for (const r of rooms) {
      const s = solved.find((x) => x.id === r.id)!
      expect(s.widthM * s.depthM).toBeCloseTo(r.area, 0)
    }

    // Public rooms sit farther in +Y (south/sunny facade) than the service ones.
    const liv = solved.find((r) => r.id === 'liv')!
    const bath = solved.find((r) => r.id === 'bath')!
    expect(liv.posY).toBeGreaterThan(bath.posY)
  })

  it('inserts a corridor spine at least MIN_CORRIDOR_WIDTH_M wide between private rooms', () => {
    const rooms: SolverRoomInput[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, area: 22 },
      { id: 'b1', type: 'BEDROOM', floor: 0, area: 14 },
      { id: 'b2', type: 'BEDROOM', floor: 0, area: 14 },
      { id: 'corr', type: 'CORRIDOR', floor: 0, area: 3 }, // AI-emitted tiny corridor
    ]
    const solved = solveFloorPlan(rooms)
    const corridor = solved.find((r) => r.id === 'corr')!
    expect(corridor.depthM).toBeGreaterThanOrEqual(MIN_CORRIDOR_WIDTH_M - 0.01)
    expect(noOverlap(solved)).toBe(true)
  })

  it('multi-floor plans: upper floor envelope stays inside the ground floor footprint', () => {
    const rooms: SolverRoomInput[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, area: 30 },
      { id: 'kit', type: 'KITCHEN', floor: 0, area: 12 },
      { id: 'bath0', type: 'BATHROOM', floor: 0, area: 6 },
      { id: 'b1', type: 'BEDROOM', floor: 1, area: 14 },
      { id: 'b2', type: 'BEDROOM', floor: 1, area: 14 },
      { id: 'bath1', type: 'BATHROOM', floor: 1, area: 6 },
    ]
    const solved = solveFloorPlan(rooms)
    const g = solved.filter((r) => r.floor === 0)
    const u = solved.filter((r) => r.floor === 1)

    const bounds = (rs: typeof solved) => ({
      maxX: Math.max(...rs.map((r) => r.posX + r.widthM)),
      maxY: Math.max(...rs.map((r) => r.posY + r.depthM)),
    })
    const gb = bounds(g)
    const ub = bounds(u)
    // Upper floor cannot overhang the ground floor.
    expect(ub.maxX).toBeLessThanOrEqual(gb.maxX + 0.01)
    expect(ub.maxY).toBeLessThanOrEqual(gb.maxY + 0.01)
  })

  it('exterior rooms (terrace/garage) sit outside the main indoor envelope', () => {
    const rooms: SolverRoomInput[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, area: 24 },
      { id: 'kit', type: 'KITCHEN', floor: 0, area: 10 },
      { id: 'bed', type: 'BEDROOM', floor: 0, area: 14 },
      { id: 'ter', type: 'TERRACE', floor: 0, area: 12 },
    ]
    const solved = solveFloorPlan(rooms)
    const indoor = solved.filter((r) => r.zone !== 'EXTERIOR')
    const indoorMaxY = Math.max(...indoor.map((r) => r.posY + r.depthM))
    const terrace = solved.find((r) => r.id === 'ter')!
    expect(terrace.posY).toBeGreaterThanOrEqual(indoorMaxY - 0.01)
    expect(noOverlap(solved)).toBe(true)
  })

  it('is deterministic — same input, same output', () => {
    const rooms: SolverRoomInput[] = [
      { id: 'a', type: 'LIVING_ROOM', floor: 0, area: 22 },
      { id: 'b', type: 'BEDROOM', floor: 0, area: 14 },
      { id: 'c', type: 'BATHROOM', floor: 0, area: 6 },
    ]
    expect(solveFloorPlan(rooms)).toEqual(solveFloorPlan(rooms))
  })
})
