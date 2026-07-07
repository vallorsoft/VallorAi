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

  /**
   * Returns a wall's layer stack (with material details), auto-provisioning
   * a sensible generic-default assembly on first access if none exists yet —
   * this is what makes the spec-inspector panel show real values immediately,
   * without requiring a separate manual setup step. Order is outside -> inside.
   */
  async getWallLayers(wallId: string) {
    const existing = await prisma.assemblyLayer.findMany({
      where: { wallId },
      include: { material: true },
      orderBy: { order: 'asc' },
    })
    if (existing.length > 0) return existing

    const wall = await prisma.wall.findUniqueOrThrow({ where: { id: wallId } })
    await this.provisionDefaultWallAssembly(wall.id, wall.isExterior)

    return prisma.assemblyLayer.findMany({
      where: { wallId },
      include: { material: true },
      orderBy: { order: 'asc' },
    })
  }

  private async provisionDefaultWallAssembly(wallId: string, isExterior: boolean) {
    const byName = async (name: string) =>
      prisma.material.findFirstOrThrow({ where: { name, source: 'GENERIC_DEFAULT' } })

    if (isExterior) {
      const [render, block, plaster, paint] = await Promise.all([
        byName('Tencuială exterioară (grund)'),
        byName('Leiertherm 38 N+F'),
        byName('Glet de var/ipsos'),
        byName('Vopsea lavabilă interior'),
      ])
      await prisma.assemblyLayer.createMany({
        data: [
          { wallId, order: 1, materialId: render.id, thicknessMm: 18, function: 'RENDER' },
          { wallId, order: 2, materialId: block.id, thicknessMm: 380, function: 'STRUCTURAL' },
          { wallId, order: 3, materialId: plaster.id, thicknessMm: 2, function: 'FINISH' },
          { wallId, order: 4, materialId: paint.id, thicknessMm: 0.3, function: 'PAINT' },
        ],
      })
    } else {
      const [plaster, brick] = await Promise.all([
        byName('Glet de var/ipsos'),
        byName('Cărămidă plină arsă'),
      ])
      await prisma.assemblyLayer.createMany({
        data: [
          { wallId, order: 1, materialId: plaster.id, thicknessMm: 2, function: 'FINISH' },
          { wallId, order: 2, materialId: brick.id, thicknessMm: 240, function: 'STRUCTURAL' },
          { wallId, order: 3, materialId: plaster.id, thicknessMm: 2, function: 'FINISH' },
        ],
      })
    }
  }
}
