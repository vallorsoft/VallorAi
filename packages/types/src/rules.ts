export type CountryCode = 'RO' | 'HU' | 'AT' | 'DE' | 'PL' | 'IT' | 'FR'

export interface BuildingRule {
  id: string
  country: CountryCode
  code: string
  name: string
  description: string
  value: number | string | boolean
  unit?: string
  applicableTo: string[]
}

export interface RuleViolation {
  ruleId: string
  ruleCode: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  affectedElements: string[]
  suggestion?: string
}

export interface RulesValidationResult {
  passed: boolean
  violations: RuleViolation[]
  passedRules: string[]
  permitReadiness: number
}

export interface RomanianBuildingRules {
  minRoomArea: Record<string, number>
  minCorridorWidth: number
  minStaircaseWidth: number
  minCeilingHeight: number
  maxBuildingCoverage: number
  minSetbacks: {
    front: number
    rear: number
    side: number
  }
  energyClass: string
  fireRegulations: FireRegulation[]
}

export interface FireRegulation {
  id: string
  description: string
  requirement: string
}

export interface PermitDocument {
  id: string
  type: 'DTAC' | 'PTH' | 'DDE' | 'PAC' | 'POE'
  name: string
  projectId: string
  status: 'DRAFT' | 'READY' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  fileUrl?: string
  generatedAt?: Date
}
