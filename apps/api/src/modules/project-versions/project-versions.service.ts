import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

/**
 * Shared by HousesModule (snapshot-on-mutation) and ProjectsModule (list/restore),
 * so both sides create/point at ProjectVersion rows the same way instead of
 * duplicating the snapshot logic in two places.
 */
@Injectable()
export class ProjectVersionsService {
  /**
   * Snapshots the current full state of a House (floors, roofType, rooms,
   * walls, openings) into a new immutable ProjectVersion row, and points the
   * parent Project's `currentVersionId` at it.
   *
   * Returns null if the house no longer exists (e.g. race with a delete).
   */
  async snapshotHouse(houseId: string, userId: string, label?: string) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: { rooms: true, walls: true, openings: true },
    })
    if (!house) return null

    const snapshot = {
      floors: house.floors,
      roofType: house.roofType,
      rooms: house.rooms,
      walls: house.walls,
      openings: house.openings,
    }

    const version = await prisma.projectVersion.create({
      data: {
        projectId: house.projectId,
        snapshot: snapshot as never,
        createdBy: userId,
        ...(label ? { label } : {}),
      },
    })

    await prisma.project.update({
      where: { id: house.projectId },
      data: { currentVersionId: version.id },
    })

    return version
  }
}
