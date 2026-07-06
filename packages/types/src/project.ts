export type ProjectType =
  | 'FAMILY_HOUSE'
  | 'VACATION_HOUSE'
  | 'EXTENSION'
  | 'RENOVATION'
  | 'OFFICE'
  | 'INVESTMENT'

export type ProjectStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'APPROVED'
  | 'PERMIT_READY'
  | 'CONSTRUCTION'
  | 'COMPLETED'

export type ArchitecturalStyle =
  | 'MODERN'
  | 'MINIMALIST'
  | 'SCANDINAVIAN'
  | 'MEDITERRANEAN'
  | 'TRADITIONAL'
  | 'RURAL'
  | 'PREMIUM'
  | 'LUXURY'

export interface Plot {
  id: string
  projectId: string
  country: string
  county: string
  city: string
  address: string
  cadastralNumber?: string
  coordinates?: { lat: number; lng: number }
  area: number
  slope: number
  orientation: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  utilities: {
    water: boolean
    sewage: boolean
    gas: boolean
    electricity: boolean
    internet: boolean
  }
  zone?: string
  photos: string[]
  documents: string[]
}

export interface Project {
  id: string
  userId: string
  name: string
  type: ProjectType
  status: ProjectStatus
  plot?: Plot
  lifestyle?: LifestyleProfile
  budget?: Budget
  house?: HouseDesign
  createdAt: Date
  updatedAt: Date
}

export interface LifestyleProfile {
  residents: number
  children: number
  planningChildren: boolean
  elderlyResident: boolean
  mobilityImpaired: boolean
  pets: boolean
  homeOffice: boolean
  garage: boolean
  pool: boolean
  terrace: boolean
  basement: boolean
  attic: boolean
  solarPanels: boolean
  heatPump: boolean
  architecturalStyle: ArchitecturalStyle
  favoriteColors: string[]
  additionalNotes: string
}

export interface Budget {
  currency: 'RON' | 'EUR' | 'HUF'
  minimum: number
  optimal: number
  maximum: number
}

export interface HouseDesign {
  id: string
  projectId: string
  totalArea: number
  floors: number
  rooms: Room[]
  walls: Wall[]
  openings: Opening[]
  version: number
  generatedAt: Date
}
