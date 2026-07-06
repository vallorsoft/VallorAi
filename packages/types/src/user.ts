export type UserRole =
  | 'GUEST'
  | 'USER'
  | 'CLIENT'
  | 'ARCHITECT'
  | 'STRUCTURAL_ENGINEER'
  | 'MEP_ENGINEER'
  | 'ELECTRICAL_ENGINEER'
  | 'CONTRACTOR'
  | 'MANUFACTURER'
  | 'SUPPLIER'
  | 'ADMIN'

export type SubscriptionPlan = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  plan: SubscriptionPlan
  language: 'ro' | 'hu' | 'en' | 'de' | 'fr' | 'it' | 'es' | 'pl'
  country: string
  avatarUrl?: string
  createdAt: Date
  updatedAt: Date
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}
