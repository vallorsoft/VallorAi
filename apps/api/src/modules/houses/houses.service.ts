import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import { deriveFoundationSpec, resolveFrostDepthMm } from '@ai-home-designer/bim-engine'
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

  /**
   * A wall's reinforcement specs (LONGITUDINAL / STIRRUP rebar). Unlike
   * getWallLayers there is NO auto-provisioning here: plain masonry walls
   * carry no reinforcement, and inventing a structural rebar default would
   * violate Key rule 7 (every value must trace to a real source). Rows exist
   * only where reinforcement was actually specified for the element.
   */
  async getWallReinforcement(wallId: string) {
    return prisma.reinforcementSpec.findMany({
      where: { wallId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * The house's constructive-minimum strip-footing spec (concrete +
   * reinforcement), auto-provisioning a Foundation row on first access if
   * none exists yet — unlike getWallReinforcement, every house needs SOME
   * foundation, so a real, standards-cited default (STAS 6054-77 frost
   * depth + NP 112-2014 constructive minimums, see bim-engine
   * foundation.ts) is legitimate here, the same way getWallLayers
   * auto-provisions a wall assembly.
   *
   * `depthVerified` is recomputed from the *current* Plot locality on every
   * call rather than persisted: it reflects whether today's site address
   * matches a cited STAS 6054-77 locality, which can only get more accurate
   * as the user fills in the plot address — persisting a stale flag from
   * provision time would understate that.
   */
  async getFoundation(houseId: string) {
    const include = {
      assemblyLayers: { include: { material: true }, orderBy: { order: 'asc' as const } },
      reinforcementSpecs: true,
    }
    let foundation = await prisma.foundation.findFirst({ where: { houseId }, include })

    const house = await prisma.house.findUniqueOrThrow({
      where: { id: houseId },
      include: { walls: true, project: { include: { plot: true } } },
    })

    if (!foundation) {
      await this.provisionDefaultFoundation(house)
      foundation = await prisma.foundation.findFirstOrThrow({ where: { houseId }, include })
    }

    const locality = house.project.plot?.county ?? house.project.plot?.city ?? null
    return { ...foundation, depthVerified: resolveFrostDepthMm(locality).verified }
  }

  private async provisionDefaultFoundation(house: {
    id: string
    walls: { thickness: number; isExterior: boolean; isLoad: boolean }[]
    project: { plot: { county: string | null; city: string | null } | null }
  }) {
    const loadBearingWalls = house.walls.filter((w) => w.isExterior || w.isLoad)
    const wallThicknessMm = loadBearingWalls.reduce(
      (max, w) => Math.max(max, w.thickness * 1000),
      0,
    )
    const locality = house.project.plot?.county ?? house.project.plot?.city ?? null
    const spec = deriveFoundationSpec(wallThicknessMm, locality)

    const [leanConcrete, structuralConcrete] = await Promise.all([
      prisma.material.findFirstOrThrow({
        where: { name: 'Beton de egalizare C8/10', source: 'GENERIC_DEFAULT' },
      }),
      prisma.material.findFirstOrThrow({
        where: { name: 'Beton C16/20', source: 'GENERIC_DEFAULT' },
      }),
    ])

    const foundation = await prisma.foundation.create({
      data: {
        houseId: house.id,
        depthMm: spec.depthMm,
        widthMm: spec.widthMm,
        concreteClass: spec.concreteClass,
      },
    })

    await prisma.assemblyLayer.createMany({
      data: [
        {
          foundationId: foundation.id,
          order: 1,
          materialId: leanConcrete.id,
          thicknessMm: spec.leanConcreteThicknessMm,
          function: 'STRUCTURAL',
        },
        {
          foundationId: foundation.id,
          order: 2,
          materialId: structuralConcrete.id,
          thicknessMm: spec.depthMm,
          function: 'STRUCTURAL',
        },
      ],
    })

    await prisma.reinforcementSpec.createMany({
      data: [
        {
          foundationId: foundation.id,
          role: 'TRANSVERSE',
          barDiameterMm: spec.reinforcement.transverse.diameterMm,
          spacingMm: spec.reinforcement.transverse.spacingMm,
          coverMm: spec.reinforcementCoverMm,
          concreteClass: spec.concreteClass,
        },
        {
          foundationId: foundation.id,
          role: 'LONGITUDINAL',
          barDiameterMm: spec.reinforcement.distribution.diameterMm,
          spacingMm: spec.reinforcement.distribution.spacingMm,
          coverMm: spec.reinforcementCoverMm,
          concreteClass: spec.concreteClass,
        },
      ],
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
