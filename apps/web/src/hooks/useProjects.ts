import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Structural + roof spec panels — hooks. These mirror useWallLayers's shape:
 * one useQuery per element, keyed by the id the API takes. Everything is
 * read-only except the roof, which has an interactive PATCH via useUpdateRoof
 * (backed by HousesService.updateRoof).
 */

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return res.data as Project[]
    },
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const res = await api.get(`/projects/${id}`)
      return res.data as Project
    },
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; type: string; description?: string }) => {
      const res = await api.post('/projects', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useHouse(projectId: string) {
  return useQuery({
    queryKey: ['houses', projectId],
    queryFn: async () => {
      const res = await api.get(`/houses/projects/${projectId}`)
      return res.data
    },
    enabled: !!projectId,
  })
}

export interface WallAssemblyLayer {
  id: string
  order: number
  thicknessMm: number
  function: 'STRUCTURAL' | 'INSULATION' | 'RENDER' | 'FINISH' | 'PAINT'
  material: {
    id: string
    category: string
    name: string
    standardRef: string | null
    unit: string
    unitCostRON: number
    specSheet: { priceVerified?: boolean } & Record<string, unknown>
  }
}

export async function fetchWallLayers(wallId: string): Promise<WallAssemblyLayer[]> {
  const res = await api.get(`/houses/walls/${wallId}/layers`)
  return res.data as WallAssemblyLayer[]
}

export function useWallLayers(wallId: string | null) {
  return useQuery({
    queryKey: ['wall-layers', wallId],
    queryFn: () => fetchWallLayers(wallId as string),
    enabled: !!wallId,
  })
}

export interface WallReinforcementSpec {
  id: string
  role: 'LONGITUDINAL' | 'STIRRUP' | 'TRANSVERSE'
  barDiameterMm: number
  spacingMm: number
  coverMm: number
  concreteClass: string
  barCount: number | null
}

export async function fetchWallReinforcement(wallId: string): Promise<WallReinforcementSpec[]> {
  const res = await api.get(`/houses/walls/${wallId}/reinforcement`)
  return res.data as WallReinforcementSpec[]
}

export function useWallReinforcement(wallId: string | null) {
  return useQuery({
    queryKey: ['wall-reinforcement', wallId],
    queryFn: () => fetchWallReinforcement(wallId as string),
    enabled: !!wallId,
  })
}

export interface ElementReinforcementSpec {
  id: string
  role: 'LONGITUDINAL' | 'STIRRUP' | 'TRANSVERSE'
  barDiameterMm: number
  spacingMm: number
  barCount: number | null
  coverMm: number
  concreteClass: string
}

export interface TieColumnRow {
  id: string
  houseId: string
  floor: number
  posX: number
  posY: number
  category: 'S1' | 'S2' | 'S3'
  crossSectionMm: number
  concreteClass: string
  reinforcementSpecs: ElementReinforcementSpec[]
}

export interface CenturaRow {
  id: string
  houseId: string
  wallId: string
  level: number
  heightMm: number
  widthMm: number
  concreteClass: string
  reinforcementSpecs: ElementReinforcementSpec[]
}

export async function fetchTieColumns(houseId: string): Promise<TieColumnRow[]> {
  const res = await api.get(`/houses/${houseId}/tie-columns`)
  return res.data as TieColumnRow[]
}

export async function fetchCenturi(houseId: string): Promise<CenturaRow[]> {
  const res = await api.get(`/houses/${houseId}/centuri`)
  return res.data as CenturaRow[]
}

export function useTieColumns(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['tie-columns', houseId],
    queryFn: () => fetchTieColumns(houseId as string),
    enabled: !!houseId,
  })
}

export function useCenturi(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['centuri', houseId],
    queryFn: () => fetchCenturi(houseId as string),
    enabled: !!houseId,
  })
}

export interface FoundationAssemblyLayer {
  id: string
  order: number
  thicknessMm: number
  function: 'STRUCTURAL' | 'INSULATION' | 'RENDER' | 'FINISH' | 'PAINT'
  material: {
    id: string
    category: string
    name: string
    standardRef: string | null
    unit: string
    unitCostRON: number
    specSheet: { priceVerified?: boolean } & Record<string, unknown>
  }
}

export interface FoundationRow {
  id: string
  houseId: string
  depthMm: number
  widthMm: number
  concreteClass: string
  /** Recomputed on every read from the current Plot locality — see HousesService.getFoundation. */
  depthVerified: boolean
  assemblyLayers: FoundationAssemblyLayer[]
  reinforcementSpecs: ElementReinforcementSpec[]
}

export function useFoundation(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['foundation', houseId],
    queryFn: async () => {
      const res = await api.get(`/houses/${houseId}/foundation`)
      return res.data as FoundationRow
    },
    enabled: !!houseId,
  })
}

export interface LintelRow {
  id: string
  openingId: string
  lengthMm: number
  widthMm: number
  bearingLengthMm: number
  prefabricated: boolean
  material: {
    id: string
    name: string
    standardRef: string | null
    unit: string
    unitCostRON: number
    specSheet: { priceVerified?: boolean } & Record<string, unknown>
  }
}

export function useLintel(openingId: string | null | undefined) {
  return useQuery({
    queryKey: ['lintel', openingId],
    queryFn: async () => {
      const res = await api.get(`/houses/openings/${openingId}/lintel`)
      return res.data as LintelRow
    },
    enabled: !!openingId,
  })
}

/**
 * Editor-side roof data (with the material + verified flags). The 3D viewer
 * has its own useRoof in components/viewer3d/useRoof.ts that returns a leaner
 * shape (no material); the two hooks intentionally coexist rather than force
 * every 3D consumer to depend on the material lookup they don't need.
 */
export type EditorRoofType = 'GABLED' | 'HIPPED' | 'FLAT' | 'MONOSLOPE'

export interface EditorRoof {
  id: string
  houseId: string
  type: EditorRoofType
  pitchDeg: number
  overhangM: number
  ridgeHeightM: number
  pitchVerified: boolean
  overhangVerified: boolean
  material: {
    id: string
    name: string
    standardRef: string | null
    unit: string
    unitCostRON: number
    specSheet: { priceVerified?: boolean } & Record<string, unknown>
  } | null
}

export function useEditorRoof(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['editor-roof', houseId],
    queryFn: async () => {
      const res = await api.get(`/houses/${houseId}/roof`)
      return res.data as EditorRoof
    },
    enabled: !!houseId,
  })
}

export function useUpdateRoof(houseId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: { type?: EditorRoofType; pitchDeg?: number; overhangM?: number }) => {
      const res = await api.patch(`/houses/${houseId}/roof`, patch)
      return res.data as EditorRoof
    },
    onSuccess: (data) => {
      qc.setQueryData(['editor-roof', houseId], data)
      // The 3D viewer reads via its own useRoof hook — invalidate so it
      // re-fetches the new pitch/type.
      qc.invalidateQueries({ queryKey: ['roof', houseId] })
    },
  })
}

/**
 * BOQ inspector data — mirrors the shape CostsService.estimateByArea returns.
 * The `verified` / `notes` fields land on lines whose *geometric* quantity
 * itself has a verification concept (roof overhang/pitch, foundation frost
 * depth); the `priceVerified` flag reflects the seeded Material's price
 * disclaimer. Both surface as small amber "unverified" chips in the panel.
 */
export interface CostBoqLine {
  category: string
  name: string
  quantity: number
  unit: string
  unitPrice: number
  standardRef?: string
  priceVerified?: boolean
  verified?: boolean
  notes?: string
}

export interface CostEstimateResponse {
  breakdown: CostBoqLine[]
  total: number
  currency: string
}

export function useCostEstimate(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['cost-estimate', projectId],
    queryFn: async () => {
      const res = await api.get(`/costs/projects/${projectId}/estimate`)
      return res.data as CostEstimateResponse
    },
    enabled: !!projectId,
  })
}

/**
 * Manual "Adaugă perete" toolbar mode wire-up. Payload matches
 * HousesService.addWall's expected shape (start/end in meters, floor as a
 * signed integer). On success, invalidates the house query so the new wall
 * shows up in the canvas + toolbar floor-switcher + cost-estimate panel.
 */
export interface AddWallPayload {
  startX: number
  startY: number
  endX: number
  endY: number
  floor: number
  thickness?: number
  height?: number
  isExterior?: boolean
}

export function useAddWall(houseId: string | null | undefined, projectId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AddWallPayload) => {
      const res = await api.post(`/houses/${houseId}/walls`, payload)
      return res.data
    },
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: ['houses', projectId] })
        qc.invalidateQueries({ queryKey: ['cost-estimate', projectId] })
      }
    },
  })
}

export function useConversation(projectId: string) {
  return useQuery({
    queryKey: ['conversation', projectId],
    queryFn: async () => {
      const res = await api.get(`/ai/projects/${projectId}/conversation`)
      return res.data as ConversationMessage[]
    },
    enabled: !!projectId,
  })
}

interface Project {
  id: string
  name: string
  type: string
  status: string
  style?: string
  createdAt: string
  updatedAt: string
}

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
