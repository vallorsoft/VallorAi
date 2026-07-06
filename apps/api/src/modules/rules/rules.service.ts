import { Injectable } from '@nestjs/common'

interface Room { type: string; area: number; width?: number }
interface House { rooms: Room[]; walls?: unknown[] }

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

  validate(house: House, country = 'RO'): ValidationResult {
    const violations: ValidationViolation[] = []
    const passedRules: string[] = []

    if (country !== 'RO') {
      return { passed: true, violations: [], passedRules: ['GENERIC_OK'], permitReadiness: 80 }
    }

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

    if (!hasLiving) violations.push({ ruleCode: 'RO_REQUIRED_LIVING', severity: 'ERROR', message: 'Lipsă living room', affectedElements: [], suggestion: 'Adaugă o cameră de zi' })
    else passedRules.push('RO_REQUIRED_LIVING')

    if (!hasBathroom) violations.push({ ruleCode: 'RO_REQUIRED_BATH', severity: 'ERROR', message: 'Lipsă baie/toaletă', affectedElements: [], suggestion: 'Adaugă o baie' })
    else passedRules.push('RO_REQUIRED_BATH')

    if (!hasKitchen) violations.push({ ruleCode: 'RO_REQUIRED_KITCHEN', severity: 'ERROR', message: 'Lipsă bucătărie', affectedElements: [], suggestion: 'Adaugă o bucătărie' })
    else passedRules.push('RO_REQUIRED_KITCHEN')

    const errors = violations.filter((v) => v.severity === 'ERROR').length
    const passed = errors === 0
    const total = violations.length + passedRules.length
    const permitReadiness = total > 0 ? Math.round((passedRules.length / total) * 100) : 100

    return { passed, violations, passedRules, permitReadiness }
  }
}
