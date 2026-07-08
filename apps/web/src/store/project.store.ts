import { create } from 'zustand'

export interface Room {
  id: string
  type: string
  name: string
  area: number
  width: number
  height: number
  floor: number
  posX?: number
  posY?: number
}

export interface Wall {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  floor: number
  thickness: number
  height: number
  isExterior: boolean
}

/**
 * A door/window hole in a wall. `position` is the distance (m) from the
 * wall's start point to the opening's near jamb along the wall axis;
 * `sillHeight` is the opening's bottom above the wall base (0 for doors) —
 * same convention as bim-engine's WallOpeningMm, in meters.
 */
export interface Opening {
  id: string
  wallId: string
  type: string
  position: number
  width: number
  height: number
  sillHeight: number
}

export interface House {
  id: string
  floors: number
  totalArea?: number
  roofType?: string
  rooms: Room[]
  walls: Wall[]
  /** Present when loaded from the API (`GET /houses/projects/:id` includes openings). */
  openings?: Opening[]
}

interface ProjectStore {
  activeProjectId: string | null
  house: House | null
  selectedRoomId: string | null
  selectedWallId: string | null
  editorMode: 'select' | 'add-room' | 'add-wall'
  viewMode: '2d' | '3d'
  /** Floor level shown by the 2D canvas (the 3D view stacks all floors). */
  activeFloor: number
  setActiveProject: (id: string) => void
  setHouse: (house: House) => void
  selectRoom: (id: string | null) => void
  selectWall: (id: string | null) => void
  setEditorMode: (mode: ProjectStore['editorMode']) => void
  setViewMode: (mode: ProjectStore['viewMode']) => void
  setActiveFloor: (floor: number) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  activeProjectId: null,
  house: null,
  selectedRoomId: null,
  selectedWallId: null,
  editorMode: 'select',
  viewMode: '2d',
  activeFloor: 0,
  setActiveProject: (id) => set({ activeProjectId: id }),
  setHouse: (house) => set({ house }),
  selectRoom: (id) => set({ selectedRoomId: id, selectedWallId: null }),
  selectWall: (id) => set({ selectedWallId: id, selectedRoomId: null }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveFloor: (floor) => set({ activeFloor: floor, selectedRoomId: null, selectedWallId: null }),
}))
