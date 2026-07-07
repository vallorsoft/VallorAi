import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import { ProjectVersionsService } from '../project-versions/project-versions.service'

type RoomSnapshot = { id: string; houseId: string } & Record<string, unknown>
type WallSnapshot = { id: string; houseId: string } & Record<string, unknown>
type OpeningSnapshot = { id: string; houseId: string; wallId: string } & Record<string, unknown>
type HouseSnapshot = {
  floors?: number
  roofType?: string
  rooms?: RoomSnapshot[]
  walls?: WallSnapshot[]
  openings?: OpeningSnapshot[]
}

@Injectable()
export class ProjectsService {
  constructor(private readonly projectVersions: ProjectVersionsService) {}

  /** Lightweight ownership check — avoids findOne's heavy nested include when
   *  callers only need to confirm the project exists and belongs to userId. */
  private async assertOwnership(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundException('Project not found')
    if (project.userId !== userId) throw new ForbiddenException()
    return project
  }

  findAllByUser(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      include: { plot: true, budget: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async findOne(id: string, userId: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        plot: true,
        lifestyle: true,
        budget: true,
        house: {
          include: { rooms: true, walls: true, openings: true },
        },
        costEstimate: true,
        documents: true,
      },
    })
    if (!project) throw new NotFoundException('Project not found')
    if (project.userId !== userId) throw new ForbiddenException()
    return project
  }

  create(userId: string, data: { name: string; type?: string }) {
    return prisma.project.create({
      data: { userId, name: data.name, type: (data.type as never) ?? 'FAMILY_HOUSE' },
    })
  }

  async update(id: string, userId: string, data: { name?: string; status?: string }) {
    await this.findOne(id, userId)
    return prisma.project.update({ where: { id }, data: data as never })
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId)
    return prisma.project.delete({ where: { id } })
  }

  async updatePlot(projectId: string, userId: string, data: Record<string, unknown>) {
    await this.findOne(projectId, userId)
    return prisma.plot.upsert({
      where: { projectId },
      create: { projectId, ...data } as never,
      update: data as never,
    })
  }

  async updateLifestyle(projectId: string, userId: string, data: Record<string, unknown>) {
    await this.findOne(projectId, userId)
    return prisma.lifestyle.upsert({
      where: { projectId },
      create: { projectId, ...data } as never,
      update: data as never,
    })
  }

  async updateBudget(projectId: string, userId: string, data: Record<string, unknown>) {
    await this.findOne(projectId, userId)
    return prisma.budget.upsert({
      where: { projectId },
      create: { projectId, ...data } as never,
      update: data as never,
    })
  }

  async listVersions(projectId: string, userId: string) {
    await this.assertOwnership(projectId, userId)
    return prisma.projectVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, createdAt: true, createdBy: true },
    })
  }

  /**
   * Restores a House's rooms/walls/openings to match an earlier ProjectVersion
   * snapshot. Room/Wall/Opening ids are DB-generated, so the restore wipes the
   * current rows and recreates them from the snapshot inside a transaction.
   * Walls are recreated before openings, and old-wall-id -> new-wall-id is
   * tracked so openings can be relinked to the freshly-created walls.
   *
   * Restoring is itself a mutation: it snapshots the now-restored state as a
   * brand new ProjectVersion afterwards, so history only ever grows (undoing
   * an undo is possible).
   */
  async restoreVersion(projectId: string, versionId: string, userId: string) {
    await this.assertOwnership(projectId, userId)

    const version = await prisma.projectVersion.findUnique({ where: { id: versionId } })
    if (!version || version.projectId !== projectId) {
      throw new NotFoundException('Version not found')
    }

    const house = await prisma.house.findUnique({ where: { projectId } })
    if (!house) throw new NotFoundException('House not found for project')

    const snapshot = version.snapshot as HouseSnapshot

    await prisma.$transaction(async (tx) => {
      // Children first: openings -> walls -> rooms (openings reference walls).
      await tx.opening.deleteMany({ where: { houseId: house.id } })
      await tx.wall.deleteMany({ where: { houseId: house.id } })
      await tx.room.deleteMany({ where: { houseId: house.id } })

      await tx.house.update({
        where: { id: house.id },
        data: {
          floors: snapshot.floors ?? house.floors,
          roofType: snapshot.roofType ?? house.roofType,
        },
      })

      for (const room of snapshot.rooms ?? []) {
        const { id: _id, houseId: _houseId, ...rest } = room
        await tx.room.create({ data: { houseId: house.id, ...rest } as never })
      }

      // Recreate walls first and remember old id -> new id, so openings
      // (which reference a wall by id) can be relinked to the new rows.
      const wallIdMap = new Map<string, string>()
      for (const wall of snapshot.walls ?? []) {
        const { id: oldId, houseId: _houseId, ...rest } = wall
        const created = await tx.wall.create({ data: { houseId: house.id, ...rest } as never })
        wallIdMap.set(oldId, created.id)
      }

      for (const opening of snapshot.openings ?? []) {
        const { id: _id, houseId: _houseId, wallId: oldWallId, ...rest } = opening
        const newWallId = wallIdMap.get(oldWallId)
        if (!newWallId) continue // stale reference to a wall not present in this snapshot
        await tx.opening.create({ data: { houseId: house.id, wallId: newWallId, ...rest } as never })
      }
    })

    return this.projectVersions.snapshotHouse(house.id, userId, `Restored from ${versionId}`)
  }
}
