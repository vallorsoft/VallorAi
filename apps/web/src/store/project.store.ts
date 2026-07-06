import { create } from 'zustand'

interface Room {
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

interface Wall {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  floor: number
  thickness: number
}

interface House {
  id: string
  floors: number
  totalArea?: number
  roofType?: string
  rooms: Room[]
  walls: Wall[]
}

interface ProjectStore {
  activeProjectId: string | null
  house: House | null
  selectedRoomId: string | null
  selectedWallId: string | null
  editorMode: 'select' | 'add-room' | 'add-wall'
  setActiveProject: (id: string) => void
  setHouse: (house: House) => void
  selectRoom: (id: string | null) => void
  selectWall: (id: string | null) => void
  setEditorMode: (mode: ProjectStore['editorMode']) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  activeProjectId: null,
  house: null,
  selectedRoomId: null,
  selectedWallId: null,
  editorMode: 'select',
  setActiveProject: (id) => set({ activeProjectId: id }),
  setHouse: (house) => set({ house }),
  selectRoom: (id) => set({ selectedRoomId: id, selectedWallId: null }),
  selectWall: (id) => set({ selectedWallId: id, selectedRoomId: null }),
  setEditorMode: (mode) => set({ editorMode: mode }),
}))
