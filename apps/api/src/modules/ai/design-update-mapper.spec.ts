import { nextRoomPosition, roomFromDesignUpdateData } from './design-update-mapper'

describe('roomFromDesignUpdateData', () => {
  it('maps a ground-floor ADD_ROOM payload to room fields', () => {
    const room = roomFromDesignUpdateData({
      floor: 'parter',
      room_type: 'living_room',
      suggested_area_sqm: 45,
      description: 'Un living room generos la parter.',
    })

    expect(room).not.toBeNull()
    expect(room?.type).toBe('living_room')
    expect(room?.name).toBe('Living Room')
    expect(room?.floor).toBe(0)
    expect(room?.area).toBe(45)
    expect(room?.height).toBe(2.7)
    expect(room?.width).toBeGreaterThan(0)
    expect(room?.aiJustification).toBe('Un living room generos la parter.')
  })

  it('resolves Hungarian and Romanian floor names to the same levels', () => {
    expect(roomFromDesignUpdateData({ floor: 'foldszint', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(0)
    expect(roomFromDesignUpdateData({ floor: 'parter', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(0)
    expect(roomFromDesignUpdateData({ floor: 'emelet', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(1)
    expect(roomFromDesignUpdateData({ floor: 'etaj', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(1)
    expect(roomFromDesignUpdateData({ floor: 'exterior', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(0)
  })

  it('falls back to a numeric string or plain number for unrecognized floor labels', () => {
    expect(roomFromDesignUpdateData({ floor: '2', room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(2)
    expect(roomFromDesignUpdateData({ floor: 3, room_type: 'x', suggested_area_sqm: 10 })?.floor).toBe(3)
  })

  it('returns null for the whole-house "global" style/summary update (no real room)', () => {
    const result = roomFromDesignUpdateData({
      floor: 'global',
      style: 'climatized-mediterranean',
      footprint_sqm: 110,
      total_area_sqm: 220,
      features: ['pool', 'external_boiler'],
    })
    expect(result).toBeNull()
  })

  it('returns null when room_type is missing', () => {
    expect(roomFromDesignUpdateData({ floor: 'parter', suggested_area_sqm: 20 })).toBeNull()
  })

  it('returns null when suggested_area_sqm is missing, zero, or negative', () => {
    expect(roomFromDesignUpdateData({ floor: 'parter', room_type: 'office' })).toBeNull()
    expect(roomFromDesignUpdateData({ floor: 'parter', room_type: 'office', suggested_area_sqm: 0 })).toBeNull()
    expect(roomFromDesignUpdateData({ floor: 'parter', room_type: 'office', suggested_area_sqm: -5 })).toBeNull()
  })

  it('returns null when the floor cannot be resolved at all', () => {
    expect(
      roomFromDesignUpdateData({ floor: 'atmosphere', room_type: 'office', suggested_area_sqm: 20 }),
    ).toBeNull()
  })

  it('humanizes a compound room_type into a readable name when no description is given', () => {
    const room = roomFromDesignUpdateData({
      floor: 'exterior',
      room_type: 'boiler_room',
      suggested_area_sqm: 10,
    })
    expect(room?.name).toBe('Boiler Room')
    expect(room?.aiJustification).toBeUndefined()
  })
})

describe('nextRoomPosition', () => {
  it('places the first room on a floor at the origin', () => {
    expect(nextRoomPosition([], 0)).toEqual({ posX: 0, posY: 0 })
  })

  it('places each subsequent room to the right of the rightmost existing room, with a gap', () => {
    const pos = nextRoomPosition([{ posX: 0, width: 5 }], 0)
    expect(pos).toEqual({ posX: 5.3, posY: 0 })
  })

  it('uses the rightmost edge across multiple existing rooms, not just the last one', () => {
    const pos = nextRoomPosition(
      [
        { posX: 0, width: 5 },
        { posX: 5.3, width: 3 },
      ],
      0,
    )
    expect(pos).toEqual({ posX: 8.6, posY: 0 })
  })

  it('offsets each floor into its own row so floors do not overlap in the (floor-unaware) 2D canvas', () => {
    expect(nextRoomPosition([], 1)).toEqual({ posX: 0, posY: 15 })
    expect(nextRoomPosition([], -1)).toEqual({ posX: 0, posY: -15 })
  })
})
