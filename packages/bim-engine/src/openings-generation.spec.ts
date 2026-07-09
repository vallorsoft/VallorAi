import {
  generateOpenings,
  BATHROOM_DOOR_WIDTH_M,
  INTERIOR_DOOR_WIDTH_M,
  ENTRY_DOOR_WIDTH_M,
  WINDOW_TO_FLOOR_RATIO,
  WINDOW_SILL_HEIGHT_M,
  HIGH_SILL_HEIGHT_M,
  type SolvedRoomFootprint,
} from './openings-generation'
import { deriveWallsFromRooms } from './wall-generation'

const roomsToFootprints = (rooms: SolvedRoomFootprint[]) =>
  rooms.map((r) => ({
    id: r.id,
    floor: r.floor,
    posX: r.posX,
    posY: r.posY,
    widthM: r.widthM,
    depthM: r.depthM,
  }))

describe('openings-generation', () => {
  it('returns [] when there are no walls or rooms', () => {
    expect(generateOpenings([], [])).toEqual([])
  })

  it('places one interior door between two adjacent rooms', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'a', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'b', type: 'BEDROOM', floor: 0, posX: 4, posY: 0, widthM: 3, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)

    const doors = openings.filter((o) => o.type === 'DOOR')
    expect(doors).toHaveLength(1)
    expect(doors[0].widthM).toBe(INTERIOR_DOOR_WIDTH_M)
    expect(doors[0].heightM).toBe(2.1)
    expect(doors[0].sillHeightM).toBe(0)
  })

  it('uses the bathroom door width when the door leads into a bathroom', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'bath', type: 'BATHROOM', floor: 0, posX: 4, posY: 0, widthM: 2.5, depthM: 3 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    const door = openings.find((o) => o.type === 'DOOR')!
    expect(door.widthM).toBe(BATHROOM_DOOR_WIDTH_M)
  })

  it('windows on exterior walls hit the target 1/8 room-area ratio', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 6, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    const windows = openings.filter((o) => o.type === 'WINDOW')
    expect(windows.length).toBeGreaterThan(0)
    const totalWindowArea = windows.reduce((s, w) => s + w.widthM * w.heightM, 0)
    const target = 6 * 5 * WINDOW_TO_FLOOR_RATIO
    // Snapping to residential-module widths means we get close, not exact.
    expect(totalWindowArea).toBeGreaterThanOrEqual(target * 0.6)
    expect(totalWindowArea).toBeLessThanOrEqual(target * 2)
  })

  it('windows in a bathroom use the higher privacy sill', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'bath', type: 'BATHROOM', floor: 0, posX: 4, posY: 0, widthM: 2.5, depthM: 3 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    const bathWindows = openings.filter((o) => o.type === 'WINDOW' && o.roomId === 'bath')
    for (const w of bathWindows) expect(w.sillHeightM).toBe(HIGH_SILL_HEIGHT_M)
    const livingWindows = openings.filter((o) => o.type === 'WINDOW' && o.roomId === 'liv')
    for (const w of livingWindows) expect(w.sillHeightM).toBe(WINDOW_SILL_HEIGHT_M)
  })

  it('places exactly one entry door on the ground-floor living room', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 6, depthM: 5 },
      { id: 'bed', type: 'BEDROOM', floor: 0, posX: 6, posY: 0, widthM: 4, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    const entry = openings.filter((o) => o.type === 'ENTRY_DOOR')
    expect(entry).toHaveLength(1)
    expect(entry[0].widthM).toBe(ENTRY_DOOR_WIDTH_M)
    expect(entry[0].roomId).toBe('liv')
  })

  it('multi-floor: entry door only on the ground floor', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'liv', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 6, depthM: 5 },
      { id: 'b1', type: 'BEDROOM', floor: 1, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'b2', type: 'BEDROOM', floor: 1, posX: 4, posY: 0, widthM: 4, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    const entries = openings.filter((o) => o.type === 'ENTRY_DOOR')
    expect(entries).toHaveLength(1)
    expect(entries[0].roomId).toBe('liv')
  })

  it('deterministic — same input, same output', () => {
    const rooms: SolvedRoomFootprint[] = [
      { id: 'a', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'b', type: 'BEDROOM', floor: 0, posX: 4, posY: 0, widthM: 3, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    expect(generateOpenings(walls, rooms)).toEqual(generateOpenings(walls, rooms))
  })

  it('never places an opening on an exterior-corner wall that is shorter than the smallest door', () => {
    // A tiny 0.4 m facade slot — must not receive an opening.
    const rooms: SolvedRoomFootprint[] = [
      { id: 'a', type: 'LIVING_ROOM', floor: 0, posX: 0, posY: 0, widthM: 0.4, depthM: 3 },
    ]
    const walls = deriveWallsFromRooms(roomsToFootprints(rooms))
    const openings = generateOpenings(walls, rooms)
    // The 0.4 m facades and 3.0 m sides all exist; only tolerable ones should get openings.
    for (const o of openings) {
      const wall = walls[o.wallIndex]
      const dx = wall.endX - wall.startX
      const dy = wall.endY - wall.startY
      const run = Math.sqrt(dx * dx + dy * dy)
      expect(run).toBeGreaterThanOrEqual(o.widthM + 2 * 0.25 - 1e-6)
    }
  })
})
