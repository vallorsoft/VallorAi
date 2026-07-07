import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import { ProjectVersionsService } from '../project-versions/project-versions.service'

@Injectable()
export class HousesService {
  constructor(private readonly projectVersions: ProjectVersionsService) {}

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
  }, userId: string) {
    const room = await prisma.room.create({ data: { houseId, ...data } })
    await this.projectVersions.snapshotHouse(houseId, userId)
    return room
  }

  async updateRoom(roomId: string, data: Partial<{
    name: string; area: number; width: number; height: number; posX: number; posY: number
  }>, userId: string) {
    const room = await prisma.room.update({ where: { id: roomId }, data })
    await this.projectVersions.snapshotHouse(room.houseId, userId)
    return room
  }

  async removeRoom(roomId: string, userId: string) {
    const room = await prisma.room.delete({ where: { id: roomId } })
    await this.projectVersions.snapshotHouse(room.houseId, userId)
    return room
  }

  async addWall(houseId: string, data: {
    startX: number; startY: number; endX: number; endY: number
    floor: number; thickness?: number; height?: number
    isLoad?: boolean; isExterior?: boolean; material?: string
  }, userId: string) {
    const wall = await prisma.wall.create({ data: { houseId, ...data } })
    await this.projectVersions.snapshotHouse(houseId, userId)
    return wall
  }

  async updateWall(wallId: string, data: object, userId: string) {
    const wall = await prisma.wall.update({ where: { id: wallId }, data: data as never })
    await this.projectVersions.snapshotHouse(wall.houseId, userId)
    return wall
  }

  async addOpening(houseId: string, wallId: string, data: {
    type: string; position: number; width: number; height: number
    sillHeight?: number; swingDirection?: string
  }, userId: string) {
    const opening = await prisma.opening.create({ data: { houseId, wallId, ...data } })
    await this.projectVersions.snapshotHouse(houseId, userId)
    return opening
  }

  async recalculateTotalArea(houseId: string) {
    const rooms = await prisma.room.findMany({ where: { houseId } })
    const total = rooms.reduce((sum, r) => sum + r.area, 0)
    return prisma.house.update({ where: { id: houseId }, data: { totalArea: total } })
  }
}
