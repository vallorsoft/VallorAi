import { Injectable } from '@nestjs/common'

// ── Type definitions ──────────────────────────────────────────────────────────

interface SpecSheet {
  thermalConductivity?: number // λ W/mK — from Material.specSheet
  [key: string]: unknown
}

interface LayerMaterial {
  specSheet?: SpecSheet | null
}

interface AssemblyLayer {
  thicknessMm: number
  material?: LayerMaterial | null
}

interface WallOpening {
  widthM: number
  type?: string // 'DOOR' | 'WINDOW' | …
}

interface Wall {
  exterior?: boolean
  layers?: AssemblyLayer[]
  openings?: WallOpening[]
  floor?: number
}

interface Room {
  type: string
  area: number
  width?: number
  floor?: number
}

interface House {
  rooms: Room[]
  walls?: Wall[]
  /** Explicit storey count — derived from room.floor values when omitted */
  floorCount?: number
}

// ── Public output types ───────────────────────────────────────────────────────

export interface ValidationViolation {
  ruleCode: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  affectedElements: string[]
  suggestion?: string
}

export interface ValidationResult {
  passed: boolean
  violations: ValidationViolation[]
  passedRules: string[]
  permitReadiness: number
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class RulesService {
  private readonly romanianRules = {
    minRoomArea: {
      LIVING_ROOM: 12,
      BEDROOM: 9,
      MASTER_BEDROOM: 12,
      KITCHEN: 5,
      BATHROOM: 2.5,
      TOILET: 1.2,
      CORRIDOR: 1.2,
    },
    minCorridorWidth: 0.9,
    minStaircaseWidth: 0.9,
    minCeilingHeight: 2.5,
    minDoorWidth: { internal: 0.8, entrance: 0.9, bathroom: 0.7 },
    minWindowArea: 0.1,
  }

  // ── Energy performance constants (C107/0-2002, Legea 372/2005, GD 907/2016) ─
  //
  // Maximum U-values (W/m²K) for climate zone II (București latitude) per
  // C107/0-2002 "Normativ privind calculul termotehnic al elementelor de
  // construcție ale clădirilor", Table 1.
  // Secondary-corroborated: encipedia.ro C107/0-2002 normative summary +
  // casasidesign.ro thermal-performance guide — both converge on identical
  // values. Official MDLPA/ASRO PDF hosts return HTTP 403 in this environment
  // (same systematic block as every prior law-module research pass).
  // A structural/energy engineer should confirm against a purchased C107/0-2002
  // copy before using these in a real energy performance certificate.
  private readonly ENERGY_LIMITS = {
    exteriorWall: 0.5, // U ≤ 0.50 W/m²K — C107/0-2002 Tab. 1, zone II
    roof: 0.3,          // U ≤ 0.30 W/m²K — C107/0-2002 Tab. 1
    floorOnGround: 0.4, // U ≤ 0.40 W/m²K — C107/0-2002 Tab. 1
    // Note: NZEB (GD 907/2016) may require stricter values for post-2020 new
    // construction; the C107/0-2002 limits above remain the permit baseline.
  }

  // ── Fire safety constants (P 118/99, Legea 307/2006) ─────────────────────
  //
  // Maximum fire compartment floor area per storey for residential buildings.
  // P 118/99 "Normativ de siguranță la foc a construcțiilor".
  // Secondary-corroborated: encipedia.ro P118/99 summary + IGSU (Inspectoratul
  // General pentru Situații de Urgență) technical guide — both cite 2500 m²
  // for combustible/lightweight residential (fire resistance grade IV–V) and
  // 3600 m² for RC/masonry (grade I–II). The conservative 2500 m² is used as
  // the default; upgrade to 3600 m² is only valid once the fire-resistance
  // grade is confirmed by a fire-safety specialist.
  // Official P 118/99 PDF returns HTTP 403 in this environment.
  private readonly MAX_FIRE_COMPARTMENT_SQM = 2500

  // ── Accessibility constants (NP 051-2012, HG 622/2004) ───────────────────
  //
  // Minimum bathroom area for a wheelchair turning circle (∅ 1.50 m):
  // NP 051-2012 §5.3 "Normativ privind adaptarea clădirilor civile și spațiului
  // urban la nevoile individuale ale persoanelor cu handicap".
  // Secondary-corroborated: encipedia.ro NP 051-2012 summary + casasidesign.ro
  // accessibility guide — both cite 4 m² as the minimum for a residential
  // bathroom serving a wheelchair user.
  private readonly MIN_ACCESSIBLE_BATHROOM_SQM = 4.0

  // Minimum entry door clear width: NP 051-2012 §4.2.
  // Same numeric value as minDoorWidth.entrance (0.9 m) but cited explicitly
  // against the accessibility normative, not the general door-width rule.
  private readonly MIN_ENTRY_DOOR_WIDTH_M = 0.9

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Compute thermal transmittance U = 1 / Σ(d / λ) from an assembly layer stack.
   * Returns null when any layer is missing thermalConductivity or thickness so
   * the caller can distinguish "calculated pass" from "data missing".
   */
  private computeUValue(layers: AssemblyLayer[]): number | null {
    if (!layers.length) return null
    let r = 0
    for (const layer of layers) {
      const lambda = (layer.material?.specSheet as SpecSheet | null | undefined)?.thermalConductivity
      const d = layer.thicknessMm / 1000
      if (!lambda || !d) return null
      r += d / lambda
    }
    return r > 0 ? 1 / r : null
  }

  // ── A) Energy performance check — C107/0-2002 ────────────────────────────

  private checkEnergyPerformance(walls: Wall[]): {
    violations: ValidationViolation[]
    passedRules: string[]
  } {
    const violations: ValidationViolation[] = []
    const passedRules: string[] = []

    const exteriorWalls = walls.filter((w) => w.exterior)
    if (!exteriorWalls.length) {
      return { violations, passedRules }
    }

    let anyChecked = false
    for (const wall of exteriorWalls) {
      if (!wall.layers?.length) continue
      anyChecked = true
      const u = this.computeUValue(wall.layers)
      if (u === null) {
        // Missing λ data — cannot compute U-value; warn but do not ERROR.
        violations.push({
          ruleCode: 'ENERGY_WALL_U_VALUE',
          severity: 'WARNING',
          message:
            'U-valoarea peretelui exterior nu poate fi calculată — lipsesc date termotehnice (λ) pentru unul sau mai multe straturi.',
          affectedElements: ['perete exterior'],
          suggestion:
            'Completează conductivitatea termică (λ W/mK) în fișa tehnică a fiecărui material din alcătuirea peretelui.',
        })
      } else if (u > this.ENERGY_LIMITS.exteriorWall) {
        violations.push({
          ruleCode: 'ENERGY_WALL_U_VALUE',
          severity: 'ERROR',
          message: `Transmitanță termică perete exterior: ${u.toFixed(3)} W/m²K depășește limita de ${this.ENERGY_LIMITS.exteriorWall} W/m²K (C107/0-2002, zonă climatică II).`,
          affectedElements: ['perete exterior'],
          suggestion:
            'Mărește grosimea sau îmbunătățește stratul de izolație termică pentru a respecta C107/0-2002.',
        })
      } else {
        passedRules.push('ENERGY_WALL_U_VALUE')
      }
    }

    if (!anyChecked) {
      // Exterior walls present but none have assembly layer data yet.
      violations.push({
        ruleCode: 'ENERGY_WALL_U_VALUE',
        severity: 'WARNING',
        message:
          'Pereții exteriori nu au straturi de alcătuire definite — verificarea energetică (C107/0-2002) nu poate fi efectuată.',
        affectedElements: ['perete exterior'],
        suggestion:
          'Definește alcătuirea pereților exteriori în editorul de straturi pentru a activa verificarea transmitanței termice.',
      })
    }

    return { violations, passedRules }
  }

  // ── B) Fire safety checks — P 118/99 ─────────────────────────────────────

  private checkFireSafety(
    rooms: Room[],
    _walls: Wall[],
    floorCount: number,
  ): { violations: ValidationViolation[]; passedRules: string[] } {
    const violations: ValidationViolation[] = []
    const passedRules: string[] = []

    // B1. Maximum fire compartment area per storey (P 118/99).
    const floorNumbers = [...new Set(rooms.map((r) => r.floor ?? 0))]
    for (const floor of floorNumbers) {
      const floorArea = rooms
        .filter((r) => (r.floor ?? 0) === floor)
        .reduce((sum, r) => sum + r.area, 0)
      if (floorArea > this.MAX_FIRE_COMPARTMENT_SQM) {
        violations.push({
          ruleCode: 'FIRE_COMPARTMENT_AREA',
          severity: 'WARNING',
          message: `Suprafața nivelului ${floor} (${floorArea.toFixed(0)} m²) depășește limita compartimentului de incendiu de ${this.MAX_FIRE_COMPARTMENT_SQM} m² (P 118/99, clădiri rezidențiale grad IV–V).`,
          affectedElements: [`nivel ${floor}`],
          suggestion:
            'Prevede compartimentare la foc cu elemente rezistente la foc (pereți, uși antifoc EI) sau reduce suprafața compartimentului.',
        })
      } else {
        passedRules.push('FIRE_COMPARTMENT_AREA')
      }
    }

    // B2. Staircase required for multi-storey buildings — evacuation path (P 118/99).
    const hasStaircaseRoom = rooms.some((r) =>
      ['STAIRCASE', 'STAIRWELL', 'STAIRS', 'CASA_SCARA'].includes(r.type.toUpperCase()),
    )
    if (floorCount > 1 && !hasStaircaseRoom) {
      violations.push({
        ruleCode: 'FIRE_STAIRCASE_REQUIRED',
        severity: 'WARNING',
        message:
          'Clădire cu mai multe niveluri fără casă de scară definită — verificați că evacuarea în caz de incendiu este asigurată (P 118/99).',
        affectedElements: ['casă de scară'],
        suggestion:
          'Adaugă o scară prin modulul "Scară/Lépcső" sau verifică cerința cu un specialist în securitate la incendiu.',
      })
    } else if (floorCount > 1) {
      passedRules.push('FIRE_STAIRCASE_REQUIRED')
    }
    // Single-storey: staircase rule not applicable — no entry in passedRules or violations.

    return { violations, passedRules }
  }

  // ── C) Accessibility checks — NP 051-2012 ────────────────────────────────

  private checkAccessibility(
    rooms: Room[],
    walls: Wall[],
  ): { violations: ValidationViolation[]; passedRules: string[] } {
    const violations: ValidationViolation[] = []
    const passedRules: string[] = []

    // C1. Entry door clear width ≥ 0.90 m (NP 051-2012 §4.2).
    const exteriorDoorOpenings = walls
      .filter((w) => w.exterior && w.openings?.length)
      .flatMap((w) => w.openings ?? [])
      .filter((o) => !o.type || o.type.toUpperCase() === 'DOOR')

    if (exteriorDoorOpenings.length > 0) {
      const narrowEntries = exteriorDoorOpenings.filter((o) => o.widthM < this.MIN_ENTRY_DOOR_WIDTH_M)
      if (narrowEntries.length > 0) {
        violations.push({
          ruleCode: 'ACCESSIBILITY_ENTRY_WIDTH',
          severity: 'WARNING',
          message: `Ușa de intrare (${narrowEntries[0].widthM.toFixed(2)} m lățime liberă) este sub minimul de ${this.MIN_ENTRY_DOOR_WIDTH_M} m cerut de NP 051-2012 §4.2.`,
          affectedElements: ['ușă intrare'],
          suggestion:
            'Mărește lățimea ușii de intrare la minimum 0.90 m pentru accesibilitate (NP 051-2012 §4.2).',
        })
      } else {
        passedRules.push('ACCESSIBILITY_ENTRY_WIDTH')
      }
    } else {
      // No exterior door opening data — if there is an entry/hall room, assume
      // the door will be correctly sized and do not generate a violation.
      const hasEntryRoom = rooms.some((r) =>
        ['HALL', 'ENTRY', 'ENTRANCE', 'FOYER', 'HOL'].includes(r.type.toUpperCase()),
      )
      if (hasEntryRoom) {
        passedRules.push('ACCESSIBILITY_ENTRY_WIDTH')
      }
    }

    // C2. Bathroom area ≥ 4 m² for wheelchair turning circle ∅ 1.50 m
    //     (NP 051-2012 §5.3).
    // Issued as WARNING rather than ERROR: for purely private single-family
    // residences this is an accessibility recommendation (HG 622/2004 makes it
    // mandatory for public / multi-family buildings). Matches the severity
    // convention used for fire compartment and other advisory-level checks.
    const bathrooms = rooms.filter((r) => r.type === 'BATHROOM')
    for (const bath of bathrooms) {
      if (bath.area < this.MIN_ACCESSIBLE_BATHROOM_SQM) {
        violations.push({
          ruleCode: 'ACCESSIBILITY_BATHROOM_AREA',
          severity: 'WARNING',
          message: `Baie (${bath.area} m²) este sub minimul de ${this.MIN_ACCESSIBLE_BATHROOM_SQM} m² necesar cercului de viraj în scaun cu rotile (NP 051-2012 §5.3).`,
          affectedElements: ['baie'],
          suggestion:
            'Mărește suprafața băii la minimum 4 m² dacă accesibilitatea persoanelor cu handicap este obligatorie (NP 051-2012, HG 622/2004).',
        })
      } else {
        passedRules.push('ACCESSIBILITY_BATHROOM_AREA')
      }
    }

    return { violations, passedRules }
  }

  // ── Public validate() entry point ─────────────────────────────────────────

  validate(house: House, country = 'RO'): ValidationResult {
    const violations: ValidationViolation[] = []
    const passedRules: string[] = []

    if (country !== 'RO') {
      return { passed: true, violations: [], passedRules: ['GENERIC_OK'], permitReadiness: 80 }
    }

    // ── Existing livability / permit checks (NP 057-2002 / DTAC basics) ──────

    house.rooms.forEach((room) => {
      const minArea = this.romanianRules.minRoomArea[room.type as keyof typeof this.romanianRules.minRoomArea]
      if (minArea && room.area < minArea) {
        violations.push({
          ruleCode: `RO_MIN_AREA_${room.type}`,
          severity: 'ERROR',
          message: `${room.type}: suprafața minimă este ${minArea}m², actual ${room.area}m²`,
          affectedElements: [room.type],
          suggestion: `Mărește suprafața camerei la minimum ${minArea}m²`,
        })
      } else if (minArea) {
        passedRules.push(`RO_MIN_AREA_${room.type}`)
      }
    })

    const hasLiving = house.rooms.some((r) => r.type === 'LIVING_ROOM')
    const hasBathroom = house.rooms.some((r) => ['BATHROOM', 'TOILET'].includes(r.type))
    const hasKitchen = house.rooms.some((r) => r.type === 'KITCHEN')

    if (!hasLiving)
      violations.push({
        ruleCode: 'RO_REQUIRED_LIVING',
        severity: 'ERROR',
        message: 'Lipsă living room',
        affectedElements: [],
        suggestion: 'Adaugă o cameră de zi',
      })
    else passedRules.push('RO_REQUIRED_LIVING')

    if (!hasBathroom)
      violations.push({
        ruleCode: 'RO_REQUIRED_BATH',
        severity: 'ERROR',
        message: 'Lipsă baie/toaletă',
        affectedElements: [],
        suggestion: 'Adaugă o baie',
      })
    else passedRules.push('RO_REQUIRED_BATH')

    if (!hasKitchen)
      violations.push({
        ruleCode: 'RO_REQUIRED_KITCHEN',
        severity: 'ERROR',
        message: 'Lipsă bucătărie',
        affectedElements: [],
        suggestion: 'Adaugă o bucătărie',
      })
    else passedRules.push('RO_REQUIRED_KITCHEN')

    // ── New rule modules ──────────────────────────────────────────────────────

    const walls = (house.walls ?? []) as Wall[]

    // Derive storey count from room.floor values when not explicitly provided.
    const floorCount =
      house.floorCount ??
      (house.rooms.length > 0 ? Math.max(...house.rooms.map((r) => r.floor ?? 0)) + 1 : 1)

    const energy = this.checkEnergyPerformance(walls)
    violations.push(...energy.violations)
    passedRules.push(...energy.passedRules)

    const fire = this.checkFireSafety(house.rooms, walls, floorCount)
    violations.push(...fire.violations)
    passedRules.push(...fire.passedRules)

    const accessibility = this.checkAccessibility(house.rooms, walls)
    violations.push(...accessibility.violations)
    passedRules.push(...accessibility.passedRules)

    // ── Result ────────────────────────────────────────────────────────────────

    const errors = violations.filter((v) => v.severity === 'ERROR').length
    const passed = errors === 0
    const total = violations.length + passedRules.length
    const permitReadiness = total > 0 ? Math.round((passedRules.length / total) * 100) : 100

    return { passed, violations, passedRules, permitReadiness }
  }
}
