import { RulesService } from './rules.service'

describe('RulesService', () => {
  const service = new RulesService()

  // ── Existing livability / permit rule tests ───────────────────────────────

  it('passes a house that meets every Romanian minimum-area and required-room rule', () => {
    // Bathroom is 4 m² so it also satisfies the NP 051-2012 accessibility
    // turning-circle minimum (4 m²) — keeps this "all rules pass" fixture clean.
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 4 },
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

  // ── Energy performance checks (C107/0-2002) ───────────────────────────────

  it('passes energy check when exterior wall U-value is below 0.50 W/m²K (C107/0-2002)', () => {
    // λ=0.04 W/mK (PIR insulation range), d=0.38m → R=9.5, U≈0.105 W/m²K
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 4 },
      ],
      walls: [
        {
          exterior: true,
          layers: [
            { thicknessMm: 380, material: { specSheet: { thermalConductivity: 0.04 } } },
          ],
        },
      ],
    })

    expect(result.violations.some((v) => v.ruleCode === 'ENERGY_WALL_U_VALUE')).toBe(false)
    expect(result.passedRules).toContain('ENERGY_WALL_U_VALUE')
  })

  it('fails energy check when exterior wall U-value exceeds 0.50 W/m²K (C107/0-2002)', () => {
    // λ=0.8 W/mK (brick without insulation), d=0.10m → R=0.125, U=8.0 W/m²K
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 4 },
      ],
      walls: [
        {
          exterior: true,
          layers: [
            { thicknessMm: 100, material: { specSheet: { thermalConductivity: 0.8 } } },
          ],
        },
      ],
    })

    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'ENERGY_WALL_U_VALUE', severity: 'ERROR' }),
    )
  })

  // ── Fire safety checks (P 118/99) ────────────────────────────────────────

  it('does not flag staircase for a single-storey house (P 118/99)', () => {
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 4 },
      ],
      floorCount: 1,
    })

    expect(result.violations.some((v) => v.ruleCode === 'FIRE_STAIRCASE_REQUIRED')).toBe(false)
  })

  it('warns about missing staircase for a multi-storey house without one (P 118/99)', () => {
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14, floor: 0 },
        { type: 'KITCHEN', area: 6, floor: 0 },
        { type: 'BATHROOM', area: 4, floor: 0 },
        { type: 'BEDROOM', area: 12, floor: 1 },
      ],
      floorCount: 2,
    })

    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'FIRE_STAIRCASE_REQUIRED', severity: 'WARNING' }),
    )
  })

  // ── Accessibility checks (NP 051-2012) ───────────────────────────────────

  it('warns when bathroom area is below 4 m² accessibility minimum (NP 051-2012 §5.3)', () => {
    const result = service.validate({
      rooms: [
        { type: 'LIVING_ROOM', area: 14 },
        { type: 'KITCHEN', area: 6 },
        { type: 'BATHROOM', area: 3 }, // below NP 051-2012 turning-circle minimum
      ],
    })

    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'ACCESSIBILITY_BATHROOM_AREA', severity: 'WARNING' }),
    )
    // A warning must not block the permit (passed is still true if no ERRORs)
    expect(result.passed).toBe(true)
  })
})
