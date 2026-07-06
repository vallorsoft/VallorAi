import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

@Injectable()
export class HousesService {
  async findByProject(projectId: string) {
    return prisma.house.findUnique({
      where: { projectId },
      include: { rooms: true, walls: true, openings: true },
    })
  }

  async upsert(projectId: string, data: { floors?: number; roofType?: string }) {
    return prisma.house.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
      include: { rooms: true, walls: true, openings: true },
    })
  }

  async addRoom(houseId: string, data: {
    type: string
    name: string
    floor: number
    area: number
    width: number
    height: number
    posX?: number
    posY?: number
    aiJustification?: string
  }) {
    return prisma.room.create({ data: { houseId, ...data } })
  }

  async updateRoom(roomId: string, data: Partial<{
    name: string; area: number; width: number; height: number; posX: number; posY: number
  }>) {
    return prisma.room.update({ where: { id: roomId }, data })
  }

  async removeRoom(roomId: string) {
    return prisma.room.delete({ where: { id: roomId } })
  }

  async addWall(houseId: string, data: {
    startX: number; startY: number; endX: number; endY: number
    floor: number; thickness?: number; height?: number
    isLoad?: boolean; isExterior?: boolean; material?: string
  }) {
    return prisma.wall.create({ data: { houseId, ...data } })
  }

  async updateWall(wallId: string, data: object) {
    return prisma.wall.update({ where: { id: wallId }, data: data as never })
  }

  async addOpening(houseId: string, wallId: string, data: {
    type: string; position: number; width: number; height: number
    sillHeight?: number; swingDirection?: string
  }) {
    return prisma.opening.create({ data: { houseId, wallId, ...data } })
  }

  async recalculateTotalArea(houseId: string) {
    const rooms = await prisma.room.findMany({ where: { houseId } })
    const total = rooms.reduce((sum, r) => sum + r.area, 0)
    return prisma.house.update({ where: { id: houseId }, data: { totalArea: total } })
  }
}
