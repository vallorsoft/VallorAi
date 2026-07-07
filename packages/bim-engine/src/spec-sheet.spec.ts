import { brickModuleFromSpecSheet } from './spec-sheet'

describe('brickModuleFromSpecSheet', () => {
  it('maps the seeded Leiertherm 38 N+F specSheet to a joint-free head module', () => {
    // Mirrors packages/database/prisma/seed.ts — N+F tongue-and-groove means
    // no vertical mortar joint.
    const module = brickModuleFromSpecSheet({
      lengthMm: 250,
      widthMm: 380,
      heightMm: 238,
      piecesPerM2: 16,
      tongueAndGroove: true,
    })
    expect(module).toEqual({
      lengthMm: 250,
      heightMm: 238,
      widthMm: 380,
      bedJointMm: 12,
      headJointMm: 0,
    })
  })

  it('applies NE 001/1996 default joints to the STAS 2945/73 solid brick', () => {
    const module = brickModuleFromSpecSheet({ lengthMm: 240, widthMm: 115, heightMm: 63 })
    expect(module).toEqual({
      lengthMm: 240,
      heightMm: 63,
      widthMm: 115,
      bedJointMm: 12,
      headJointMm: 10,
    })
  })

  it('prefers explicit joint values from the specSheet', () => {
    const module = brickModuleFromSpecSheet({
      lengthMm: 240,
      widthMm: 115,
      heightMm: 63,
      bedJointMm: 10,
      headJointMm: 0,
    })
    expect(module?.bedJointMm).toBe(10)
    expect(module?.headJointMm).toBe(0)
  })

  it('returns null when the specSheet has no unit geometry (non-masonry layers)', () => {
    expect(brickModuleFromSpecSheet({ strengthClass: 'C25/30' })).toBeNull()
    expect(brickModuleFromSpecSheet({ lengthMm: 250, widthMm: 380 })).toBeNull()
    expect(brickModuleFromSpecSheet({ lengthMm: '250', widthMm: 380, heightMm: 238 })).toBeNull()
    expect(brickModuleFromSpecSheet({ lengthMm: 0, widthMm: 380, heightMm: 238 })).toBeNull()
  })
})
