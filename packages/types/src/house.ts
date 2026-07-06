export type RoomType =
  | 'LIVING_ROOM'
  | 'DINING_ROOM'
  | 'KITCHEN'
  | 'PANTRY'
  | 'BEDROOM'
  | 'MASTER_BEDROOM'
  | 'CHILDREN_ROOM'
  | 'BATHROOM'
  | 'TOILET'
  | 'CORRIDOR'
  | 'HALLWAY'
  | 'STAIRCASE'
  | 'HOME_OFFICE'
  | 'GARAGE'
  | 'STORAGE'
  | 'LAUNDRY'
  | 'BOILER_ROOM'
  | 'BASEMENT'
  | 'ATTIC'
  | 'TERRACE'
  | 'BALCONY'
  | 'POOL'
  | 'GARDEN'

export interface Point {
  x: number
  y: number
}

export interface Room {
  id: string
  type: RoomType
  name: string
  floor: number
  area: number
  width: number
  height: number
  position: Point
  windows: string[]
  doors: string[]
  aiJustification?: string
}

export interface Wall {
  id: string
  start: Point
  end: Point
  floor: number
  thickness: number
  height: number
  material?: string
  isLoad: boolean
  isExterior: boolean
}

export type OpeningType = 'DOOR' | 'WINDOW' | 'SLIDING_DOOR' | 'FRENCH_DOOR' | 'SKYLIGHT'

export interface Opening {
  id: string
  type: OpeningType
  wallId: string
  position: number
  width: number
  height: number
  sillHeight?: number
  swingDirection?: 'LEFT' | 'RIGHT' | 'INWARD' | 'OUTWARD'
}

export interface CostEstimate {
  projectId: string
  currency: 'RON' | 'EUR' | 'HUF'
  foundation: number
  walls: number
  ceiling: number
  roof: number
  openings: number
  mechanical: number
  electrical: number
  finishes: number
  insulation: number
  laborCost: number
  total: number
  breakdown: CostBreakdownItem[]
  generatedAt: Date
}

export interface CostBreakdownItem {
  category: string
  item: string
  unit: string
  quantity: number
  unitPrice: number
  total: number
}

export interface EnergyEstimate {
  projectId: string
  energyClass: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  heatingDemand: number
  coolingDemand: number
  primaryEnergyConsumption: number
  co2Emission: number
  recommendations: string[]
}
