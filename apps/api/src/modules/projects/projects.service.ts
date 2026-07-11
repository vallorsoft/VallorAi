import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
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

const MEMBER_ROLE_ORDER = ['VIEWER', 'EDITOR', 'OWNER'] as const
type MemberRole = (typeof MEMBER_ROLE_ORDER)[number]

@Injectable()
export class ProjectsService {
  constructor(private readonly projectVersions: ProjectVersionsService) {}

  /** Lightweight ownership check — avoids findOne's heavy nested include when
   *  callers only need to confirm the project exists and belongs to userId.
   *  Public so other modules (e.g. AiModule) can reuse the same check instead
   *  of duplicating it. */
  async assertOwnership(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundException('Project not found')
    if (project.userId !== userId) throw new ForbiddenException()
    return project
  }

  /**
   * Flexible access check — satisfies both ownership and ProjectMember-based
   * access. OWNER-level callers (the project's creator) always pass regardless
   * of the required role. Member callers must have acceptedAt set and at least
   * the required role in the hierarchy (VIEWER < EDITOR < OWNER).
   */
  async assertProjectAccess(
    projectId: string,
    userId: string,
    requiredRole: MemberRole = 'VIEWER',
  ) {
    // 1. Actual project creator — all roles satisfied automatically.
    const owned = await prisma.project.findFirst({ where: { id: projectId, userId } })
    if (owned) return owned

    // Ensure the project exists for proper 404 vs 403 distinction.
    const exists = await prisma.project.findUnique({ where: { id: projectId } })
    if (!exists) throw new NotFoundException('Project not found')

    // 2. Check membership.
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { project: true },
    })
    if (!member || !member.acceptedAt)
      throw new ForbiddenException('Nincs hozzáférés ehhez a projekthez')

    const memberRoleIndex = MEMBER_ROLE_ORDER.indexOf(member.role as MemberRole)
    const requiredRoleIndex = MEMBER_ROLE_ORDER.indexOf(requiredRole)
    if (memberRoleIndex < requiredRoleIndex)
      throw new ForbiddenException('Nincs megfelelő jogosultság')

    return member.project
  }

  findAllByUser(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      include: { plot: true, budget: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  /**
   * Returns all projects accessible to the user — owned projects plus shared
   * projects where the user has accepted an invitation. Shared entries carry an
   * extra `memberRole` field so the UI can badge them differently.
   */
  async findAll(userId: string) {
    const [ownProjects, memberships] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        include: { plot: true, budget: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.projectMember.findMany({
        where: { userId, acceptedAt: { not: null } },
        include: { project: { include: { plot: true, budget: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const ownIds = new Set(ownProjects.map((p) => p.id))
    const sharedProjects = memberships
      .filter((m) => !ownIds.has(m.projectId))
      .map((m) => ({ ...m.project, memberRole: m.role as string }))

    const combined = [...ownProjects, ...sharedProjects]
    combined.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    return combined
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

  // ─────────────────────────────────────────────────────────────────────────
  // Collaboration / ProjectMember helpers
  // ─────────────────────────────────────────────────────────────────────────

  async getProjectMembers(projectId: string, requesterId: string) {
    await this.assertProjectAccess(projectId, requesterId, 'VIEWER')
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async inviteMember(
    projectId: string,
    invitedByUserId: string,
    email: string,
    role: 'EDITOR' | 'VIEWER',
  ) {
    // Only the project owner can invite others.
    await this.assertOwnership(projectId, invitedByUserId)

    const invitedUser = await prisma.user.findUnique({ where: { email } })
    if (!invitedUser)
      throw new NotFoundException(`Nem található felhasználó ezzel az email-lel: ${email}`)
    if (invitedUser.id === invitedByUserId)
      throw new BadRequestException('Saját magát nem hívhatja meg')

    return prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: invitedUser.id } },
      create: { projectId, userId: invitedUser.id, role, invitedBy: invitedByUserId },
      update: { role },
    })
  }

  async acceptInvite(projectId: string, userId: string) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })
    if (!member) throw new NotFoundException('Meghívó nem található')
    if (member.acceptedAt) return member // already accepted — idempotent
    return prisma.projectMember.update({
      where: { id: member.id },
      data: { acceptedAt: new Date() },
    })
  }

  async removeMember(projectId: string, requesterId: string, targetUserId: string) {
    // Only the owner can remove members.
    await this.assertOwnership(projectId, requesterId)
    await prisma.projectMember.deleteMany({ where: { projectId, userId: targetUserId } })
  }
}
