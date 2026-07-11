import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import {
  deriveFoundationSpec,
  deriveWallsFromRooms,
  resolveFrostDepthMm,
  resolveSeismicAg,
  deriveTieColumnPlacements,
  deriveTieColumnReinforcement,
  deriveLintelSpec,
  deriveCenturaLevels,
  deriveCenturaReinforcement,
  deriveStaircaseSpec,
  deriveMepPointsForRoom,
  solveFloorPlan,
  generateOpenings,
  deriveRoofSpec,
  deriveRidgeHeight,
  DEFAULT_ROOF_PITCH_DEG,
  DEFAULT_ROOF_OVERHANG_M,
  CENTURA_CONCRETE_CLASS,
  TIE_COLUMN_CROSS_SECTION_MM,
  TIE_COLUMN_CONCRETE_CLASS,
  type RoomFootprint,
  type WallSegment,
  type WallOpeningForConfinement,
  type CenturaWallSegment,
  type RoofType,
  type SolvedRoomFootprint,
} from '@ai-home-designer/bim-engine'
import { BadRequestException } from '@nestjs/common'
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
    // Keep auto-generated walls + openings + roof in step with the rooms they
    // were derived from (e.g. deleting the stale duplicate an UPDATE_ROOM
    // type-drift can leave behind). Houses without generated walls are left
    // untouched — a purely user-drawn house isn't the solver's business.
    const hasGenerated = await prisma.wall.findFirst({
      where: { houseId: room.houseId, isGenerated: true },
      select: { id: true },
    })
    if (hasGenerated) {
      await this.solveAndRegenerate(room.houseId, userId)
    } else {
      await this.projectVersions.snapshotHouse(room.houseId, userId)
    }
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

  /**
   * Re-derives the house's auto-generated wall set from its current room
   * rectangles (bim-engine wall-generation): deletes every wall previously
   * marked isGenerated and creates the fresh set, in one transaction.
   * User-drawn walls (isGenerated=false) are never touched. This is what
   * gives an AI-designed house actual walls — the chat only ever emits
   * rooms — so the 3D viewer, the brick-detail tier and the wall BOQ all
   * have real geometry to work from. Layer stacks on the deleted walls
   * cascade away and re-provision lazily on next access (getWallLayers), so
   * regenerated walls keep picking up the default assemblies.
   *
   * Callers who need to place openings on the freshly-created walls should
   * use `solveAndRegenerate` instead — it also (re-)solves the room layout,
   * generates openings on the new walls, and provisions the roof; this
   * primitive only regenerates walls and is kept for callers (tests, admin
   * repair) that specifically want that.
   */
  async regenerateGeneratedWalls(houseId: string, userId: string) {
    const rooms = await prisma.room.findMany({ where: { houseId } })
    const footprints: RoomFootprint[] = rooms
      .filter((r) => r.width > 0 && r.area > 0)
      .map((r) => ({
        id: r.id,
        floor: r.floor,
        posX: r.posX,
        posY: r.posY,
        widthM: r.width,
        depthM: r.area / r.width,
      }))
    const segments = deriveWallsFromRooms(footprints)

    await prisma.$transaction([
      prisma.wall.deleteMany({ where: { houseId, isGenerated: true } }),
      prisma.wall.createMany({
        data: segments.map((s) => ({
          houseId,
          floor: s.floor,
          startX: s.startX,
          startY: s.startY,
          endX: s.endX,
          endY: s.endY,
          thickness: s.thicknessM,
          isLoad: s.isLoadBearing,
          isExterior: s.isExterior,
          isGenerated: true,
        })),
      }),
    ])
    await this.projectVersions.snapshotHouse(houseId, userId)
    return { wallCount: segments.length }
  }

  /**
   * The main "the AI chat changed something about the house" entry point:
   *   1. Re-solves every room's position from the current room list
   *      (bim-engine floor-plan solver) so the house reads as a coherent
   *      footprint instead of a strip of boxes;
   *   2. Persists the new positions/dimensions to the Room rows;
   *   3. Regenerates the generated walls around the newly-positioned rooms
   *      (delete-and-recreate, same as regenerateGeneratedWalls) — this
   *      cascades openings on those walls away too;
   *   4. Generates a fresh opening set (interior doors, exterior windows,
   *      one entry door on the ground floor) on the just-created walls
   *      (bim-engine openings-generation);
   *   5. Auto-provisions the Roof row if not present, else recomputes the
   *      ridge from the new footprint.
   *
   * User-drawn walls (isGenerated=false) and their openings are untouched,
   * mirroring the pre-existing wall-regen behavior. All five steps are one
   * top-level DB write plus a project-version snapshot at the end.
   */
  async solveAndRegenerate(houseId: string, userId: string) {
    const rooms = await prisma.room.findMany({ where: { houseId } })
    if (rooms.length === 0) return { wallCount: 0, openingCount: 0, roomCount: 0 }

    const solved = solveFloorPlan(
      rooms.map((r) => ({ id: r.id, type: r.type, floor: r.floor, area: r.area })),
    )
    const solvedById = new Map(solved.map((s) => [s.id, s]))

    // Room-updates → wall-delete → wall-create → opening-create in one
    // interactive transaction so a mid-run failure doesn't leave a partial
    // house (e.g. walls with no openings, or vice-versa). Roof provisioning
    // reads the just-committed walls so it stays outside this transaction.
    const footprints: RoomFootprint[] = solved.map((s) => ({
      id: s.id,
      floor: s.floor,
      posX: s.posX,
      posY: s.posY,
      widthM: s.widthM,
      depthM: s.depthM,
    }))
    const segments = deriveWallsFromRooms(footprints)
    const solvedFootprints: SolvedRoomFootprint[] = solved.map((s) => ({
      id: s.id,
      type: rooms.find((r) => r.id === s.id)!.type,
      floor: s.floor,
      posX: s.posX,
      posY: s.posY,
      widthM: s.widthM,
      depthM: s.depthM,
    }))
    const openings = generateOpenings(segments, solvedFootprints)

    const result = await prisma.$transaction(
      async (tx) => {
        for (const room of rooms) {
          const s = solvedById.get(room.id)
          if (!s) continue
          await tx.room.update({
            where: { id: room.id },
            data: {
              posX: s.posX,
              posY: s.posY,
              width: s.widthM,
              area: Math.round(s.widthM * s.depthM * 100) / 100,
            },
          })
        }
        await tx.wall.deleteMany({ where: { houseId, isGenerated: true } })
        // Individual create()s so we get IDs back in the same order as
        // `segments` — createMany doesn't return rows, and openings need the
        // fresh wall IDs.
        const createdWalls: { id: string }[] = []
        for (const s of segments) {
          const wall = await tx.wall.create({
            data: {
              houseId,
              floor: s.floor,
              startX: s.startX,
              startY: s.startY,
              endX: s.endX,
              endY: s.endY,
              thickness: s.thicknessM,
              isLoad: s.isLoadBearing,
              isExterior: s.isExterior,
              isGenerated: true,
            },
            select: { id: true },
          })
          createdWalls.push(wall)
        }

        let openingCount = 0
        for (const o of openings) {
          const wall = createdWalls[o.wallIndex]
          if (!wall) continue
          await tx.opening.create({
            data: {
              houseId,
              wallId: wall.id,
              type: o.type,
              position: o.position,
              width: o.widthM,
              height: o.heightM,
              sillHeight: o.sillHeightM,
            },
          })
          openingCount++
        }
        return { wallCount: createdWalls.length, openingCount }
      },
      { timeout: 15000 },
    )

    // Roof: auto-provision on first pass, otherwise refresh ridge from the
    // new footprint (keep user-changed type/pitch/overhang — a UI to edit
    // those doesn't exist yet, but the persistence shape is prepared).
    await this.provisionOrRefreshRoof(houseId)

    await this.projectVersions.snapshotHouse(houseId, userId)
    return { ...result, roomCount: rooms.length }
  }

  private async provisionOrRefreshRoof(houseId: string) {
    const house = await prisma.house.findUniqueOrThrow({
      where: { id: houseId },
      include: { walls: true, roof: true },
    })
    const topFloor = house.walls.reduce((max, w) => Math.max(max, w.floor), 0)
    const topWalls = house.walls.filter((w) => w.floor === topFloor && w.isExterior)
    if (topWalls.length === 0) return null

    // Envelope from the topmost floor's exterior walls.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of topWalls) {
      minX = Math.min(minX, w.startX, w.endX)
      minY = Math.min(minY, w.startY, w.endY)
      maxX = Math.max(maxX, w.startX, w.endX)
      maxY = Math.max(maxY, w.startY, w.endY)
    }
    const lengthM = Math.max(maxX - minX, maxY - minY)
    const widthM = Math.min(maxX - minX, maxY - minY)
    if (lengthM <= 0 || widthM <= 0) return null

    const existingType = (house.roof?.type as RoofType) ?? (house.roofType as RoofType) ?? 'GABLED'
    const validType: RoofType = ['GABLED', 'HIPPED', 'FLAT', 'MONOSLOPE'].includes(existingType)
      ? existingType
      : 'GABLED'
    const spec = deriveRoofSpec(validType, { lengthM, widthM })

    if (house.roof) {
      return prisma.roof.update({
        where: { houseId },
        data: {
          type: spec.type,
          pitchDeg: house.roof.pitchDeg,  // preserve user-chosen values on refresh
          overhangM: house.roof.overhangM,
          ridgeHeightM: spec.ridgeHeightM,
          pitchVerified: house.roof.pitchVerified,
          overhangVerified: house.roof.overhangVerified,
        },
      })
    }
    const roofingMaterial = await prisma.material.findFirstOrThrow({
      where: { name: 'Țiglă ceramică Tondach standard', source: 'GENERIC_DEFAULT' },
    })
    return prisma.roof.create({
      data: {
        houseId,
        type: spec.type,
        pitchDeg: spec.pitchDeg,
        overhangM: spec.overhangM,
        ridgeHeightM: spec.ridgeHeightM,
        pitchVerified: spec.pitchVerified,
        overhangVerified: spec.overhangVerified,
        materialId: roofingMaterial.id,
      },
    })
  }

  /**
   * The house's roof — auto-provisioned via provisionOrRefreshRoof on first
   * access if no row exists yet, mirroring getFoundation. Refreshed via
   * solveAndRegenerate whenever rooms change so the ridge follows the
   * footprint automatically.
   */
  async getRoof(houseId: string) {
    const existing = await prisma.roof.findUnique({
      where: { houseId },
      include: { material: true },
    })
    if (existing) return existing
    await this.provisionOrRefreshRoof(houseId)
    return prisma.roof.findUnique({
      where: { houseId },
      include: { material: true },
    })
  }

  /**
   * User-driven roof edit. Validates `type` against the RoofType enum, coerces
   * numeric fields, and when pitch changes (or the roof is being flipped
   * to/from FLAT) recomputes `ridgeHeightM` off the current top-floor
   * footprint via `deriveRidgeHeight` — same footprint the auto-provisioner
   * uses. `pitchVerified` is set to whether the incoming value matches the
   * standards-cited default (DEFAULT_ROOF_PITCH_DEG, mid of the NP 057-2002
   * range) — a user drift off the default flips the badge to unverified,
   * matching the `Material.specSheet.priceVerified` pattern.
   * `overhangVerified` starts false (the default is convention only) and stays
   * false once the user overrides it. Idempotent — the same body sent twice
   * lands the same row.
   */
  async updateRoof(
    houseId: string,
    patch: { type?: string; pitchDeg?: number; overhangM?: number },
    userId: string,
  ) {
    const existing = await this.getRoof(houseId)
    if (!existing) throw new BadRequestException('Roof not available for this house')

    const allowedTypes: RoofType[] = ['GABLED', 'HIPPED', 'FLAT', 'MONOSLOPE']
    let nextType: RoofType = existing.type as RoofType
    if (patch.type !== undefined) {
      if (!allowedTypes.includes(patch.type as RoofType)) {
        throw new BadRequestException(`Invalid roof type: ${patch.type}`)
      }
      nextType = patch.type as RoofType
    }

    let nextPitch = existing.pitchDeg
    if (patch.pitchDeg !== undefined) {
      const n = Number(patch.pitchDeg)
      if (!Number.isFinite(n) || n < 0 || n > 89) {
        throw new BadRequestException('pitchDeg must be a finite number between 0 and 89')
      }
      nextPitch = n
    }
    // FLAT always overrides pitch to 0 — the ridge math otherwise divides by
    // tan(0) territory and the shape is by definition horizontal.
    if (nextType === 'FLAT') nextPitch = 0

    let nextOverhang = existing.overhangM
    if (patch.overhangM !== undefined) {
      const n = Number(patch.overhangM)
      if (!Number.isFinite(n) || n < 0 || n > 3) {
        throw new BadRequestException('overhangM must be a finite number between 0 and 3')
      }
      nextOverhang = n
    }

    // Recompute the ridge whenever the pitch or the type actually changes.
    let nextRidge = existing.ridgeHeightM
    if (nextPitch !== existing.pitchDeg || nextType !== existing.type) {
      const walls = await prisma.wall.findMany({ where: { houseId } })
      const topFloor = walls.reduce((max, w) => Math.max(max, w.floor), 0)
      const topWalls = walls.filter((w) => w.floor === topFloor && w.isExterior)
      const source = topWalls.length > 0 ? topWalls : walls
      if (source.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const w of source) {
          minX = Math.min(minX, w.startX, w.endX)
          minY = Math.min(minY, w.startY, w.endY)
          maxX = Math.max(maxX, w.startX, w.endX)
          maxY = Math.max(maxY, w.startY, w.endY)
        }
        const lengthM = Math.max(maxX - minX, maxY - minY)
        const widthM = Math.min(maxX - minX, maxY - minY)
        if (lengthM > 0 && widthM > 0) {
          nextRidge = deriveRidgeHeight(nextType, { lengthM, widthM }, nextPitch)
        }
      }
    }

    // Verified flags: mirror how Material.specSheet.priceVerified is treated
    // (see WallLayerPanel) — cited-default → verified, user drift → unverified.
    const pitchIsDefault =
      (nextType === 'FLAT' && nextPitch === 0) ||
      (nextType !== 'FLAT' && Math.abs(nextPitch - DEFAULT_ROOF_PITCH_DEG) < 0.01)
    const overhangIsDefault = Math.abs(nextOverhang - DEFAULT_ROOF_OVERHANG_M) < 0.001
    // `overhangVerified` is already `false` for the cited default (convention
    // only). Any drift off the default keeps it false; a user landing exactly
    // on the default does not flip an unverified value to verified.
    const nextOverhangVerified = overhangIsDefault ? existing.overhangVerified : false

    const updated = await prisma.roof.update({
      where: { houseId },
      data: {
        type: nextType,
        pitchDeg: nextPitch,
        overhangM: nextOverhang,
        ridgeHeightM: nextRidge,
        pitchVerified: pitchIsDefault,
        overhangVerified: nextOverhangVerified,
      },
      include: { material: true },
    })

    await this.projectVersions.snapshotHouse(houseId, userId)
    return updated
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

  /**
   * The house's confined-masonry tie-columns (stâlpișori), auto-provisioning
   * S1 (corner/intersection), S2 (max-spacing) and S3 (opening-flanking)
   * placements on first access, idempotent like getFoundation. S3 columns
   * are generated only for openings large enough to require confinement in
   * the site's seismic zone (CR6-2013: >= 1.5 m² where ag >= 0.25g, >= 2.5 m²
   * elsewhere) — the site ag comes from the project's Plot locality via
   * seismic.ts (P100-1/2013), defaulting conservatively (stricter threshold)
   * for an unknown locality. A below-threshold opening gets no column.
   */
  async getTieColumns(houseId: string) {
    const existing = await prisma.tieColumn.findFirst({ where: { houseId } })
    if (!existing) {
      const house = await prisma.house.findUniqueOrThrow({
        where: { id: houseId },
        include: { walls: true, openings: true, project: { include: { plot: true } } },
      })
      const locality = house.project.plot?.county ?? house.project.plot?.city ?? null
      await this.provisionTieColumns(house, resolveSeismicAg(locality).agG)
    }
    return prisma.tieColumn.findMany({
      where: { houseId },
      include: { reinforcementSpecs: true },
      orderBy: [{ floor: 'asc' }, { createdAt: 'asc' }],
    })
  }

  private async provisionTieColumns(
    house: {
      id: string
      walls: {
        id: string
        startX: number
        startY: number
        endX: number
        endY: number
        floor: number
        isExterior: boolean
        isLoad: boolean
      }[]
      openings: { wallId: string; position: number; width: number; height: number }[]
    },
    agG: number,
  ) {
    const reinforcement = deriveTieColumnReinforcement()
    const floors = new Set(house.walls.map((w) => w.floor))
    // Which floor each opening sits on is its host wall's floor.
    const wallFloor = new Map(house.walls.map((w) => [w.id, w.floor]))

    for (const floor of floors) {
      const segments: WallSegment[] = house.walls
        .filter((w) => w.floor === floor)
        .map((w) => ({
          id: w.id,
          startX: w.startX,
          startY: w.startY,
          endX: w.endX,
          endY: w.endY,
          isLoadBearing: w.isExterior || w.isLoad,
        }))
      const openings: WallOpeningForConfinement[] = house.openings
        .filter((o) => wallFloor.get(o.wallId) === floor)
        .map((o) => ({
          wallId: o.wallId,
          position: o.position,
          width: o.width,
          areaSqm: o.width * o.height,
        }))
      const placements = deriveTieColumnPlacements(segments, openings, agG)

      for (const placement of placements) {
        const tieColumn = await prisma.tieColumn.create({
          data: {
            houseId: house.id,
            floor,
            posX: placement.x,
            posY: placement.y,
            category: placement.category,
            crossSectionMm: TIE_COLUMN_CROSS_SECTION_MM,
            concreteClass: TIE_COLUMN_CONCRETE_CLASS,
          },
        })
        await prisma.reinforcementSpec.createMany({
          data: [
            {
              tieColumnId: tieColumn.id,
              role: 'LONGITUDINAL',
              barDiameterMm: reinforcement.longitudinal.diameterMm,
              spacingMm: reinforcement.longitudinal.edgeSpacingMm,
              barCount: reinforcement.longitudinal.barCount,
              coverMm: reinforcement.longitudinal.coverMm,
              concreteClass: TIE_COLUMN_CONCRETE_CLASS,
            },
            {
              tieColumnId: tieColumn.id,
              role: 'STIRRUP',
              barDiameterMm: reinforcement.stirrup.diameterMm,
              spacingMm: reinforcement.stirrup.spacingMm,
              coverMm: reinforcement.stirrup.coverMm,
              concreteClass: TIE_COLUMN_CONCRETE_CLASS,
            },
          ],
        })
      }
    }
  }

  /**
   * An opening's lintel (buiandrug), auto-provisioning a prefabricated
   * default on first access, idempotent. Reinforcement is not modeled — see
   * packages/bim-engine confined-masonry.ts's module doc comment (a
   * prefabricated unit's reinforcement is internal to the manufactured
   * product; monolithic lintel reinforcement has no cited primary source
   * yet).
   */
  async getLintel(openingId: string) {
    const existing = await prisma.lintel.findUnique({
      where: { openingId },
      include: { material: true },
    })
    if (existing) return existing

    const opening = await prisma.opening.findUniqueOrThrow({
      where: { id: openingId },
      include: { wall: true },
    })
    const spec = deriveLintelSpec(opening.width * 1000, opening.wall.thickness * 1000)
    const material = await prisma.material.findFirstOrThrow({
      where: { name: 'Buiandrug prefabricat', source: 'GENERIC_DEFAULT' },
    })

    return prisma.lintel.create({
      data: {
        openingId,
        materialId: material.id,
        lengthMm: spec.lengthMm,
        widthMm: spec.widthMm,
        bearingLengthMm: spec.bearingLengthMm,
        prefabricated: spec.prefabricated,
      },
      include: { material: true },
    })
  }

  /**
   * The house's ring beams (centuri), auto-provisioning one per load-bearing
   * wall at its own floor level (plus one extra level above the topmost
   * floor — see confined-masonry doc comment) on first access, idempotent
   * like getFoundation/getTieColumns.
   */
  async getCenturi(houseId: string) {
    const existing = await prisma.centura.findFirst({ where: { houseId } })
    if (!existing) {
      const house = await prisma.house.findUniqueOrThrow({ where: { id: houseId }, include: { walls: true } })
      await this.provisionCenturi(house)
    }
    return prisma.centura.findMany({
      where: { houseId },
      include: { reinforcementSpecs: true },
      orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    })
  }

  private async provisionCenturi(house: {
    id: string
    walls: {
      id: string
      startX: number
      startY: number
      endX: number
      endY: number
      floor: number
      thickness: number
      isExterior: boolean
      isLoad: boolean
    }[]
  }) {
    const segments: CenturaWallSegment[] = house.walls.map((w) => ({
      id: w.id,
      startX: w.startX,
      startY: w.startY,
      endX: w.endX,
      endY: w.endY,
      floor: w.floor,
      thicknessMm: w.thickness * 1000,
      isLoadBearing: w.isExterior || w.isLoad,
      isExterior: w.isExterior,
    }))
    const placements = deriveCenturaLevels(segments)

    for (const placement of placements) {
      const reinforcement = deriveCenturaReinforcement(placement.heightMm, placement.widthMm)
      const centura = await prisma.centura.create({
        data: {
          houseId: house.id,
          wallId: placement.wallId,
          level: placement.level,
          heightMm: placement.heightMm,
          widthMm: placement.widthMm,
          concreteClass: CENTURA_CONCRETE_CLASS,
        },
      })
      await prisma.reinforcementSpec.createMany({
        data: [
          {
            centuraId: centura.id,
            role: 'LONGITUDINAL',
            barDiameterMm: reinforcement.longitudinal.diameterMm,
            spacingMm: reinforcement.longitudinal.edgeSpacingMm,
            barCount: reinforcement.longitudinal.barCount,
            coverMm: reinforcement.longitudinal.coverMm,
            concreteClass: CENTURA_CONCRETE_CLASS,
          },
          {
            centuraId: centura.id,
            role: 'STIRRUP',
            barDiameterMm: reinforcement.stirrup.diameterMm,
            spacingMm: reinforcement.stirrup.spacingMm,
            coverMm: reinforcement.stirrup.coverMm,
            concreteClass: CENTURA_CONCRETE_CLASS,
          },
        ],
      })
    }
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

  // ─── Staircases ────────────────────────────────────────────────────────────

  /**
   * Returns all staircase rows for the house. Does NOT auto-provision —
   * a house has no staircase until the user explicitly adds one (a single-
   * storey house needs no staircase; the API must not invent one silently).
   */
  async getStaircases(houseId: string) {
    return prisma.staircase.findMany({
      where: { houseId },
      orderBy: [{ floor: 'asc' }, { createdAt: 'asc' }],
    })
  }

  /**
   * Derives and persists a new staircase for the given floor. Floor-to-floor
   * height defaults to LEVEL_HEIGHT_M × 1000 (2700 mm) which matches Wall
   * height defaults and the 3D viewer's LEVEL_HEIGHT_M constant.
   */
  async createStaircase(
    houseId: string,
    data: {
      floor: number
      posX?: number
      posY?: number
      widthMm?: number
      floorHeightMm?: number
      handedness?: string
    },
  ) {
    const floorHeightMm = data.floorHeightMm ?? 2700
    const spec = deriveStaircaseSpec({ floorHeightMm, widthMm: data.widthMm })
    return prisma.staircase.create({
      data: {
        houseId,
        floor: data.floor,
        posX: data.posX ?? 0,
        posY: data.posY ?? 0,
        widthM: spec.widthMm / 1000,
        lengthM: spec.horizontalRunMm / 1000,
        riserCount: spec.riserCount,
        riserHeightMm: spec.riserHeightMm,
        treadDepthMm: spec.treadDepthMm,
        handedness: data.handedness ?? 'RIGHT',
        isGenerated: false,
      },
    })
  }

  async removeStaircase(houseId: string, staircaseId: string) {
    await prisma.staircase.delete({
      where: { id: staircaseId, houseId },
    })
  }

  // ─── MEP (Mechanical, Electrical, Plumbing) ────────────────────────────────

  /**
   * Returns all MepPoint rows for the house. Auto-provisions them (idempotent)
   * on first call by iterating every room through deriveMepPointsForRoom —
   * same pattern as getFoundation/getTieColumns/getCenturi.
   *
   * Standards:
   *   I 9-2015 — sanitary installation normative (water supply / drain counts)
   *   NTE 007/08/00 + PE 155/92 — electrical installation standards
   *   (secondary-corroborated; official PDFs 403 in this environment)
   */
  async getMepPoints(houseId: string) {
    const existing = await prisma.mepPoint.findMany({ where: { houseId } })
    if (existing.length > 0) return existing

    return this._provisionMepPoints(houseId)
  }

  /**
   * Deletes all auto-provisioned MepPoint rows for the house and re-derives
   * them from the current room set. Call after room type changes.
   */
  async regenerateMepPoints(houseId: string) {
    await prisma.mepPoint.deleteMany({ where: { houseId } })
    return this._provisionMepPoints(houseId)
  }

  private async _provisionMepPoints(houseId: string) {
    const rooms = await prisma.room.findMany({ where: { houseId } })
    const rows: {
      houseId: string
      roomId: string
      type: 'WATER_SUPPLY' | 'HOT_WATER_SUPPLY' | 'DRAIN' | 'ELECTRICAL_OUTLET' | 'SWITCH' | 'LIGHTING_POINT'
      count: number
      standard: string
      notes?: string | null
    }[] = []

    for (const room of rooms) {
      const specs = deriveMepPointsForRoom(room.type)
      for (const spec of specs) {
        rows.push({
          houseId,
          roomId: room.id,
          type: spec.type as 'WATER_SUPPLY' | 'HOT_WATER_SUPPLY' | 'DRAIN' | 'ELECTRICAL_OUTLET' | 'SWITCH' | 'LIGHTING_POINT',
          count: spec.count,
          standard: spec.standard,
          notes: spec.notes ?? null,
        })
      }
    }

    if (rows.length > 0) {
      await prisma.mepPoint.createMany({ data: rows })
    }

    return prisma.mepPoint.findMany({ where: { houseId } })
  }
}
