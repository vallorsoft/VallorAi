import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
  role: 'LONGITUDINAL' | 'STIRRUP'
  barDiameterMm: number
  spacingMm: number
  coverMm: number
  concreteClass: string
}

export async function fetchWallReinforcement(wallId: string): Promise<WallReinforcementSpec[]> {
  const res = await api.get(`/houses/walls/${wallId}/reinforcement`)
  return res.data as WallReinforcementSpec[]
}

export interface NewWallInput {
  houseId: string
  startX: number
  startY: number
  endX: number
  endY: number
  floor: number
  isExterior?: boolean
  isLoad?: boolean
}

/** Draw a wall in the 2D editor; refreshes the house so the store re-syncs. */
export function useAddWall(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ houseId, ...data }: NewWallInput) => {
      const res = await api.post(`/houses/${houseId}/walls`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['houses', projectId] }),
  })
}

export interface NewRoomInput {
  houseId: string
  type: string
  name: string
  floor: number
  area: number
  width: number
  height: number
  posX: number
  posY: number
}

/** Place a room in the 2D editor; refreshes the house so the store re-syncs. */
export function useAddRoom(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ houseId, ...data }: NewRoomInput) => {
      const res = await api.post(`/houses/${houseId}/rooms`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['houses', projectId] }),
  })
}

export interface NewOpeningInput {
  houseId: string
  wallId: string
  type: 'DOOR' | 'WINDOW'
  position: number
  width: number
  height: number
  sillHeight: number
}

/** Add a door/window to a wall; refreshes the house so plan + 3D re-sync. */
export function useAddOpening(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ houseId, ...data }: NewOpeningInput) => {
      const res = await api.post(`/houses/${houseId}/openings`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['houses', projectId] }),
  })
}

export function useDeleteOpening(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (openingId: string) => api.delete(`/houses/openings/${openingId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['houses', projectId] }),
  })
}

export interface StructuralReinforcementSpec {
  id: string
  role: 'LONGITUDINAL' | 'STIRRUP' | 'TRANSVERSE'
  barDiameterMm: number
  spacingMm: number
  /** Fixed bar count (tie-column/centură corner bars); null where spacing implies the count. */
  barCount?: number | null
  coverMm: number
  concreteClass: string
}

export interface TieColumn {
  id: string
  floor: number
  posX: number
  posY: number
  category: 'S1' | 'S2' | 'S3'
  crossSectionMm: number
  concreteClass: string
  reinforcementSpecs: StructuralReinforcementSpec[]
}

export interface Centura {
  id: string
  wallId: string
  level: number
  heightMm: number
  widthMm: number
  concreteClass: string
  reinforcementSpecs: StructuralReinforcementSpec[]
}

export interface Foundation {
  id: string
  depthMm: number
  widthMm: number
  concreteClass: string
  /** False when the plot locality isn't a cited STAS 6054-77 entry (fallback depth). */
  depthVerified: boolean
  assemblyLayers: WallAssemblyLayer[]
  reinforcementSpecs: StructuralReinforcementSpec[]
}

export interface Lintel {
  id: string
  openingId: string
  lengthMm: number
  widthMm: number
  bearingLengthMm: number
  prefabricated: boolean
  material: WallAssemblyLayer['material']
}

export async function fetchTieColumns(houseId: string): Promise<TieColumn[]> {
  const res = await api.get(`/houses/${houseId}/tie-columns`)
  return res.data as TieColumn[]
}

export async function fetchCenturi(houseId: string): Promise<Centura[]> {
  const res = await api.get(`/houses/${houseId}/centuri`)
  return res.data as Centura[]
}

export function useTieColumns(houseId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['tie-columns', houseId],
    queryFn: () => fetchTieColumns(houseId as string),
    enabled: !!houseId && enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCenturi(houseId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['centuri', houseId],
    queryFn: () => fetchCenturi(houseId as string),
    enabled: !!houseId && enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useFoundation(houseId: string | null) {
  return useQuery({
    queryKey: ['foundation', houseId],
    queryFn: async () => {
      const res = await api.get(`/houses/${houseId}/foundation`)
      return res.data as Foundation
    },
    enabled: !!houseId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLintel(openingId: string | null) {
  return useQuery({
    queryKey: ['lintel', openingId],
    queryFn: async () => {
      const res = await api.get(`/houses/openings/${openingId}/lintel`)
      return res.data as Lintel
    },
    enabled: !!openingId,
    staleTime: 5 * 60 * 1000,
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
