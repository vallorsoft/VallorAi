import { RulesService } from './rules.service'

describe('RulesService', () => {
  const service = new RulesService()

  it('passes a house that meets every Romanian minimum-area and required-room rule', () => {
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 3 },
      ],
    })

    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.permitReadiness).toBe(100)
  })

  it('flags a room below the Romanian minimum area', () => {
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 3 },
        { type: 'BEDROOM', area: 6 }, // minimum is 9
      ],
    })

    expect(result.passed).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'RO_MIN_AREA_BEDROOM', severity: 'ERROR' }),
    )
  })

  it('flags missing required rooms (kitchen, bathroom, living room)', () => {
    const result = service.validate({ rooms: [] })

    expect(result.passed).toBe(false)
    const ruleCodes = result.violations.map((v) => v.ruleCode)
    expect(ruleCodes).toEqual(
      expect.arrayContaining(['RO_REQUIRED_LIVING', 'RO_REQUIRED_BATH', 'RO_REQUIRED_KITCHEN']),
    )
  })

  it('bypasses Romanian rules for non-RO countries with a generic pass', () => {
    const result = service.validate({ rooms: [] }, 'HU')

    expect(result).toEqual({
      passed: true,
      violations: [],
      passedRules: ['GENERIC_OK'],
      permitReadiness: 80,
    })
  })
})
