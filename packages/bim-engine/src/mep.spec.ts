import { deriveMepPointsForRoom, classifyRoomForMep } from './mep'

describe('classifyRoomForMep — keyword classifier', () => {
  it('classifies BATHROOM by "bathroom" keyword (EN)', () => {
    expect(classifyRoomForMep('BATHROOM')).toBe('BATHROOM')
    expect(classifyRoomForMep('master_bathroom')).toBe('BATHROOM')
  })

  it('classifies BATHROOM by "baie" keyword (RO)', () => {
    expect(classifyRoomForMep('baie')).toBe('BATHROOM')
  })

  it('classifies BATHROOM by "furdo" keyword (HU)', () => {
    expect(classifyRoomForMep('furdoszoba')).toBe('BATHROOM')
  })

  it('classifies TOILET by "wc" keyword', () => {
    expect(classifyRoomForMep('WC')).toBe('TOILET')
    expect(classifyRoomForMep('wc')).toBe('TOILET')
  })

  it('classifies TOILET by "toaleta" keyword (RO)', () => {
    expect(classifyRoomForMep('toaleta')).toBe('TOILET')
  })

  it('classifies KITCHEN by "kitchen" keyword (EN)', () => {
    expect(classifyRoomForMep('KITCHEN')).toBe('KITCHEN')
    expect(classifyRoomForMep('open_kitchen')).toBe('KITCHEN')
  })

  it('classifies KITCHEN by "konyha" keyword (HU)', () => {
    expect(classifyRoomForMep('konyha')).toBe('KITCHEN')
  })

  it('classifies LIVING_ROOM by "living" keyword', () => {
    expect(classifyRoomForMep('LIVING_ROOM')).toBe('LIVING_ROOM')
    expect(classifyRoomForMep('living_room_and_kitchen')).toBe('KITCHEN') // "kitchen" longer than "living"
  })

  it('classifies BEDROOM by "bedroom" keyword', () => {
    expect(classifyRoomForMep('BEDROOM')).toBe('BEDROOM')
    expect(classifyRoomForMep('master_bedroom')).toBe('BEDROOM')
  })

  it('classifies HALLWAY by "hall" keyword', () => {
    expect(classifyRoomForMep('HALLWAY')).toBe('HALLWAY')
    expect(classifyRoomForMep('entry_hall')).toBe('HALLWAY')
  })

  it('falls back to OTHER for unknown room types', () => {
    expect(classifyRoomForMep('STORAGE')).toBe('OTHER')
    expect(classifyRoomForMep('TERRACE')).toBe('OTHER')
  })
})

describe('deriveMepPointsForRoom — BATHROOM', () => {
  it('returns 2 WATER_SUPPLY, 2 HOT_WATER_SUPPLY, 2 DRAIN for a full bathroom (I 9-2015)', () => {
    const pts = deriveMepPointsForRoom('BATHROOM')
    const water = pts.filter((p) => p.type === 'WATER_SUPPLY')
    const hot = pts.filter((p) => p.type === 'HOT_WATER_SUPPLY')
    const drain = pts.filter((p) => p.type === 'DRAIN')

    expect(water).toHaveLength(1)
    expect(water[0].count).toBe(2)
    expect(hot).toHaveLength(1)
    expect(hot[0].count).toBe(2)
    expect(drain).toHaveLength(1)
    expect(drain[0].count).toBe(2)
  })

  it('bathroom water points cite I 9-2015', () => {
    const pts = deriveMepPointsForRoom('BATHROOM')
    const waterPts = pts.filter((p) =>
      ['WATER_SUPPLY', 'HOT_WATER_SUPPLY', 'DRAIN'].includes(p.type),
    )
    for (const p of waterPts) {
      expect(p.standard).toContain('I 9-2015')
    }
  })

  it('returns 1 ELECTRICAL_OUTLET (IP44) for bathroom (NTE 007/08/00)', () => {
    const pts = deriveMepPointsForRoom('BATHROOM')
    const outlets = pts.filter((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets).toHaveLength(1)
    expect(outlets[0].count).toBe(1)
    // IP44 / zone 2 note must be present
    expect(outlets[0].notes).toBeDefined()
    expect(outlets[0].notes).toContain('IP44')
  })

  it('bathroom electrical points cite NTE 007', () => {
    const pts = deriveMepPointsForRoom('BATHROOM')
    const elec = pts.filter((p) => ['ELECTRICAL_OUTLET', 'SWITCH', 'LIGHTING_POINT'].includes(p.type))
    for (const p of elec) {
      expect(p.standard).toContain('NTE 007')
    }
  })
})

describe('deriveMepPointsForRoom — KITCHEN', () => {
  it('returns correct water points for kitchen (I 9-2015)', () => {
    const pts = deriveMepPointsForRoom('KITCHEN')
    const water = pts.find((p) => p.type === 'WATER_SUPPLY')
    const hot = pts.find((p) => p.type === 'HOT_WATER_SUPPLY')
    const drain = pts.find((p) => p.type === 'DRAIN')

    // 2 cold: sink + washing-machine pre-provision
    expect(water?.count).toBe(2)
    // 1 hot: sink only
    expect(hot?.count).toBe(1)
    // 1 drain: sink
    expect(drain?.count).toBe(1)
  })

  it('returns 4 ELECTRICAL_OUTLET for kitchen (PE 155/92)', () => {
    const pts = deriveMepPointsForRoom('KITCHEN')
    const outlets = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets?.count).toBe(4)
  })
})

describe('deriveMepPointsForRoom — LIVING_ROOM', () => {
  it('returns 4 ELECTRICAL_OUTLET for living room (PE 155/92 §5.2)', () => {
    const pts = deriveMepPointsForRoom('LIVING_ROOM')
    const outlets = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets?.count).toBe(4)
  })

  it('returns NO water points for living room', () => {
    const pts = deriveMepPointsForRoom('LIVING_ROOM')
    const waterTypes = ['WATER_SUPPLY', 'HOT_WATER_SUPPLY', 'DRAIN']
    const waterPts = pts.filter((p) => waterTypes.includes(p.type))
    expect(waterPts).toHaveLength(0)
  })

  it('includes SWITCH and LIGHTING_POINT', () => {
    const pts = deriveMepPointsForRoom('LIVING_ROOM')
    expect(pts.some((p) => p.type === 'SWITCH')).toBe(true)
    expect(pts.some((p) => p.type === 'LIGHTING_POINT')).toBe(true)
  })
})

describe('deriveMepPointsForRoom — BEDROOM', () => {
  it('returns 3 outlets, 1 switch, 1 lighting point for bedroom', () => {
    const pts = deriveMepPointsForRoom('BEDROOM')
    const outlets = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets?.count).toBe(3)
    expect(pts.some((p) => p.type === 'SWITCH')).toBe(true)
    expect(pts.some((p) => p.type === 'LIGHTING_POINT')).toBe(true)
  })

  it('returns no water points for bedroom', () => {
    const pts = deriveMepPointsForRoom('BEDROOM')
    const waterPts = pts.filter((p) =>
      ['WATER_SUPPLY', 'HOT_WATER_SUPPLY', 'DRAIN'].includes(p.type),
    )
    expect(waterPts).toHaveLength(0)
  })
})

describe('deriveMepPointsForRoom — TOILET (WC only)', () => {
  it('returns 1 cold water supply and 1 drain, no hot water (I 9-2015)', () => {
    const pts = deriveMepPointsForRoom('WC')
    const water = pts.find((p) => p.type === 'WATER_SUPPLY')
    const hot = pts.find((p) => p.type === 'HOT_WATER_SUPPLY')
    const drain = pts.find((p) => p.type === 'DRAIN')

    expect(water?.count).toBe(1)
    expect(hot).toBeUndefined()
    expect(drain?.count).toBe(1)
  })

  it('returns no ELECTRICAL_OUTLET for small toilet (NTE 007 — room too small for IP44 zone)', () => {
    const pts = deriveMepPointsForRoom('WC')
    const outlets = pts.filter((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets).toHaveLength(0)
  })

  it('returns switch and lighting for toilet', () => {
    const pts = deriveMepPointsForRoom('toilet')
    expect(pts.some((p) => p.type === 'SWITCH')).toBe(true)
    expect(pts.some((p) => p.type === 'LIGHTING_POINT')).toBe(true)
  })
})

describe('deriveMepPointsForRoom — OTHER / unknown', () => {
  it('returns general minimums for unclassified room (2 outlets, 1 switch, 1 lighting)', () => {
    const pts = deriveMepPointsForRoom('STORAGE')
    const outlets = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlets?.count).toBe(2)
    expect(pts.some((p) => p.type === 'SWITCH')).toBe(true)
    expect(pts.some((p) => p.type === 'LIGHTING_POINT')).toBe(true)
  })

  it('returns no water points for unknown room', () => {
    const pts = deriveMepPointsForRoom('STORAGE')
    const waterPts = pts.filter((p) =>
      ['WATER_SUPPLY', 'HOT_WATER_SUPPLY', 'DRAIN'].includes(p.type),
    )
    expect(waterPts).toHaveLength(0)
  })
})
