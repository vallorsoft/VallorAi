import {
  deriveWallsFromRooms,
  GENERATED_EXTERIOR_WALL_THICKNESS_M,
  GENERATED_INTERIOR_WALL_THICKNESS_M,
  type GeneratedWallSegment,
  type RoomFootprint,
} from './wall-generation'

const wallKey = (w: GeneratedWallSegment) =>
  `${w.startX},${w.startY}->${w.endX},${w.endY}`

const sortWalls = (walls: GeneratedWallSegment[]) =>
  [...walls].sort((a, b) => wallKey(a).localeCompare(wallKey(b)))

describe('wall-generation — placeholder walls from room rectangles', () => {
  it('a single room gets 4 exterior load-bearing walls on its perimeter', () => {
    const rooms: RoomFootprint[] = [
      { id: 'r1', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(rooms)

    expect(walls).toHaveLength(4)
    for (const wall of walls) {
      expect(wall.isExterior).toBe(true)
      expect(wall.isLoadBearing).toBe(true)
      expect(wall.thicknessM).toBe(GENERATED_EXTERIOR_WALL_THICKNESS_M)
      expect(wall.floor).toBe(0)
    }
    const keys = sortWalls(walls).map(wallKey)
    expect(keys).toEqual([
      '0,0->0,5', // left
      '0,0->4,0', // bottom
      '0,5->4,5', // top
      '4,0->4,5', // right
    ])
  })

  it('two same-depth rooms separated by the AI mapper 0.3m gap share one interior wall and merged facades', () => {
    // Mapper layout: room B starts at A's right edge + 0.3m gap.
    const rooms: RoomFootprint[] = [
      { id: 'a', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'b', floor: 0, posX: 4.3, posY: 0, widthM: 3, depthM: 5 },
    ]
    const walls = deriveWallsFromRooms(rooms)

    const interior = walls.filter((w) => !w.isExterior)
    expect(interior).toHaveLength(1)
    // Shared wall line = mean of the two clustered edges (4.0 and 4.3).
    expect(interior[0].startX).toBeCloseTo(4.15, 3)
    expect(interior[0].endX).toBeCloseTo(4.15, 3)
    expect(interior[0].startY).toBe(0)
    expect(interior[0].endY).toBe(5)
    expect(interior[0].thicknessM).toBe(GENERATED_INTERIOR_WALL_THICKNESS_M)
    expect(interior[0].isLoadBearing).toBe(false)

    // Bottom and top facades merge across both rooms (endpoints snapped to
    // the shared line, so no slit at the former 0.3m gap), plus left/right.
    const exterior = sortWalls(walls.filter((w) => w.isExterior))
    expect(exterior.map(wallKey)).toEqual([
      '0,0->0,5', // left
      '0,0->7.3,0', // bottom, continuous across both rooms
      '0,5->7.3,5', // top, continuous
      '7.3,0->7.3,5', // right
    ])
  })

  it('rooms of different depth: shared wall spans only the overlap, the rest stays exterior', () => {
    const rooms: RoomFootprint[] = [
      { id: 'a', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 5 },
      { id: 'b', floor: 0, posX: 4.3, posY: 0, widthM: 3, depthM: 3 },
    ]
    const walls = deriveWallsFromRooms(rooms)

    const interior = walls.filter((w) => !w.isExterior)
    expect(interior).toHaveLength(1)
    expect(interior[0].startY).toBe(0)
    expect(interior[0].endY).toBe(3) // only where both rooms touch the line

    // Above the shallower room, the same line continues as A's exterior wall.
    const exteriorOnSharedLine = walls.filter(
      (w) => w.isExterior && w.startX === w.endX && Math.abs(w.startX - 4.15) < 0.001,
    )
    expect(exteriorOnSharedLine).toHaveLength(1)
    expect(exteriorOnSharedLine[0].startY).toBe(3)
    expect(exteriorOnSharedLine[0].endY).toBe(5)

    // B's top facade sits at y=3 from the shared line to its right edge.
    const bTop = walls.filter(
      (w) => w.isExterior && w.startY === 3 && w.endY === 3,
    )
    expect(bTop).toHaveLength(1)
    expect(bTop[0].startX).toBeCloseTo(4.15, 3)
    expect(bTop[0].endX).toBeCloseTo(7.3, 3)
  })

  it('detached rooms (gap above the cluster tolerance) each keep their own full perimeter', () => {
    const rooms: RoomFootprint[] = [
      { id: 'house', floor: 0, posX: 0, posY: 0, widthM: 6, depthM: 5 },
      { id: 'annex', floor: 0, posX: 9, posY: 0, widthM: 3, depthM: 3 }, // 3m away — a detached boiler room
    ]
    const walls = deriveWallsFromRooms(rooms)
    expect(walls).toHaveLength(8)
    expect(walls.every((w) => w.isExterior)).toBe(true)
  })

  it('floors are derived independently and tagged', () => {
    const rooms: RoomFootprint[] = [
      { id: 'p', floor: 0, posX: 0, posY: 0, widthM: 4, depthM: 4 },
      { id: 'e', floor: 1, posX: 0, posY: 0, widthM: 4, depthM: 4 },
    ]
    const walls = deriveWallsFromRooms(rooms)
    expect(walls.filter((w) => w.floor === 0)).toHaveLength(4)
    expect(walls.filter((w) => w.floor === 1)).toHaveLength(4)
  })

  it('ignores degenerate rooms and returns nothing for no rooms', () => {
    expect(deriveWallsFromRooms([])).toEqual([])
    expect(
      deriveWallsFromRooms([{ id: 'x', floor: 0, posX: 0, posY: 0, widthM: 0, depthM: 5 }]),
    ).toEqual([])
  })
})
