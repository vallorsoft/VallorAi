import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import { generateFloorPlanPdf, FloorPlanData } from './floor-plan-pdf'
import { generateIfcContent, IfcExportData } from './ifc-generator'
import { generatePermitDocPdf, PermitDocData } from './permit-doc-pdf'
import { generateDxf } from './dxf-generator'
import { ProjectsService } from '../projects/projects.service'
import { RulesService } from '../rules/rules.service'

@Injectable()
export class ExportsService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly rulesService: RulesService,
  ) {}
  async generateProjectSummary(projectId: string): Promise<Record<string, unknown>> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
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

    return {
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        status: project.status,
        createdAt: project.createdAt,
      },
      plot: project.plot,
      lifestyle: project.lifestyle,
      budget: project.budget,
      house: project.house
        ? {
            floors: project.house.floors,
            totalArea: project.house.totalArea,
            roofType: project.house.roofType,
            rooms: project.house.rooms,
            walls: project.house.walls,
            openings: project.house.openings,
          }
        : null,
      costEstimate: project.costEstimate,
      documents: project.documents,
    }
  }

  async generateFloorPlanPdfForProject(projectId: string, userId: string): Promise<Buffer> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        house: {
          include: { rooms: true, walls: true },
        },
      },
    })

    if (!project) throw new NotFoundException('Project not found')

    if (!project.house) {
      // Return an "empty" PDF — no house data yet
      const emptyData: FloorPlanData = {
        projectName: project.name ?? `Projekt ${projectId.slice(-6)}`,
        date: new Date().toLocaleDateString('ro-RO'),
        floors: 1,
        rooms: [],
        walls: [],
      }
      return generateFloorPlanPdf(emptyData)
    }

    const data: FloorPlanData = {
      projectName: project.name ?? `Projekt ${projectId.slice(-6)}`,
      date: new Date().toLocaleDateString('ro-RO'),
      floors: project.house.floors ?? 1,
      rooms: project.house.rooms.map((r) => ({
        id: r.id,
        type: r.type,
        posX: r.posX ?? 0,
        posY: r.posY ?? 0,
        width: r.width ?? Math.sqrt(Math.max(r.area ?? 20, 1)),
        area: r.area ?? 20,
        floor: r.floor ?? 0,
      })),
      walls: project.house.walls.map((w) => ({
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
        thickness: w.thickness ?? 0.3,
        exterior: w.exterior ?? false,
        floor: w.floor ?? 0,
      })),
    }

    return generateFloorPlanPdf(data)
  }

  async listDocuments(projectId: string) {
    return prisma.document.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createDocument(projectId: string, data: {
    type: string
    title: string
    fileUrl?: string
  }) {
    return prisma.document.create({
      data: {
        projectId,
        type: data.type,
        name: data.title,
        fileUrl: data.fileUrl,
      },
    })
  }

  async deleteDocument(documentId: string) {
    return prisma.document.delete({ where: { id: documentId } })
  }

  async generateIfcForProject(projectId: string, userId: string): Promise<string> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        house: {
          include: { rooms: true, walls: true },
        },
      },
    })

    if (!project) throw new NotFoundException('Project not found')

    if (!project.house) {
      // No house yet — return a valid but empty IFC (hierarchy only)
      const emptyData: IfcExportData = {
        projectName: project.name ?? `Projekt ${projectId.slice(-6)}`,
        date: new Date().toISOString(),
        floors: 1,
        rooms: [],
        walls: [],
      }
      return generateIfcContent(emptyData)
    }

    const data: IfcExportData = {
      projectName: project.name ?? `Projekt ${projectId.slice(-6)}`,
      date: new Date().toISOString(),
      floors: project.house.floors ?? 1,
      rooms: project.house.rooms.map((r) => ({
        id: r.id,
        type: r.type ?? 'ROOM',
        posX: r.posX ?? 0,
        posY: r.posY ?? 0,
        width: r.width ?? Math.sqrt(Math.max(r.area ?? 20, 1)),
        area: r.area ?? 20,
        floor: r.floor ?? 0,
        height: 2.7,
      })),
      walls: project.house.walls.map((w) => ({
        id: w.id,
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
        thickness: w.thickness ?? 0.3,
        height: w.height ?? 2.7,
        exterior: w.exterior ?? false,
        floor: w.floor ?? 0,
      })),
    }

    return generateIfcContent(data)
  }

  async generateDxfForProject(projectId: string, userId: string): Promise<string> {
    await this.projectsService.assertOwnership(projectId, userId)

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        house: {
          include: { rooms: true, walls: true },
        },
      },
    })
    if (!project?.house) return generateDxf([], [])

    const { walls, rooms } = project.house

    const dxfWalls = walls.map((w) => ({
      startX: w.startX,
      startY: w.startY,
      endX: w.endX,
      endY: w.endY,
      layer: w.exterior ? `PERETI_EXT_ETAJ_${w.floor ?? 0}` : `PERETI_INT_ETAJ_${w.floor ?? 0}`,
    }))

    const dxfRooms = rooms.map((r) => ({
      posX: r.posX,
      posY: r.posY,
      width: r.width,
      depth: r.depth ?? r.width,
      label: r.type,
      floor: r.floor ?? 0,
    }))

    return generateDxf(dxfWalls, dxfRooms)
  }

  async generatePermitDocForProject(projectId: string, userId: string): Promise<Buffer> {
    // Ownership check — 403 if userId doesn't own the project.
    await this.projectsService.assertOwnership(projectId, userId)

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        plot: true,
        user: { select: { name: true } },
        house: {
          include: {
            rooms: true,
            walls: {
              include: {
                layers: {
                  include: { material: true },
                  orderBy: { order: 'asc' },
                },
                openings: true,
              },
            },
          },
        },
      },
    })

    const date = new Date().toLocaleDateString('ro-RO')
    const projectName = project.name ?? `Proiect ${projectId.slice(-6)}`
    const ownerName = project.user?.name ?? '—'

    const plotParts = [project.plot?.county, project.plot?.city].filter(Boolean)
    const projectAddress = plotParts.length > 0 ? plotParts.join(', ') : '—'

    if (!project.house) {
      // No house data yet — return a valid PDF with empty rooms/validation
      const emptyData: PermitDocData = {
        projectName,
        ownerName,
        projectAddress,
        date,
        houseData: { totalAreaSqm: 0, floorCount: 1, roomCount: 0, wallCount: 0 },
        rooms: [],
        validationResult: { permitReadiness: 0, violations: [], passedRules: [] },
      }
      return generatePermitDocPdf(emptyData)
    }

    const house = project.house
    const rooms = house.rooms
    const walls = house.walls

    // ── House summary numbers ──────────────────────────────────────────────────
    const totalAreaSqm = rooms.reduce((sum, r) => sum + (r.area ?? 0), 0)
    const floors = [...new Set(rooms.map((r) => r.floor ?? 0))]
    const floorCount = floors.length > 0 ? Math.max(...floors) + 1 : 1

    // ── Validation ────────────────────────────────────────────────────────────
    const houseForValidation = {
      rooms: rooms.map((r) => ({
        type: r.type ?? 'ROOM',
        area: r.area ?? 0,
        floor: r.floor ?? 0,
      })),
      walls: walls.map((w) => ({
        exterior: w.exterior ?? false,
        floor: w.floor ?? 0,
        layers: w.layers.map((l) => ({
          thicknessMm: l.thicknessMm,
          material: l.material
            ? { specSheet: l.material.specSheet as Record<string, unknown> | null }
            : undefined,
        })),
        openings: w.openings.map((o) => ({
          widthM: o.widthM,
          type: o.type ?? undefined,
        })),
      })),
      floorCount,
    }
    const validationResult = this.rulesService.validate(houseForValidation, 'RO')

    // ── Room list for PDF ─────────────────────────────────────────────────────
    const roomList: PermitDocData['rooms'] = rooms.map((r) => ({
      type: r.type ?? 'ROOM',
      name: r.name ?? '',
      areaSqm: r.area ?? 0,
      floor: r.floor ?? 0,
    }))

    const data: PermitDocData = {
      projectName,
      ownerName,
      projectAddress,
      date,
      houseData: {
        totalAreaSqm,
        floorCount,
        roomCount: rooms.length,
        wallCount: walls.length,
      },
      rooms: roomList,
      validationResult: {
        permitReadiness: validationResult.permitReadiness,
        violations: validationResult.violations.map((v) => ({
          ruleId: v.ruleCode,
          message: v.message,
          severity: v.severity === 'INFO' ? 'WARNING' : v.severity,
        })),
        passedRules: validationResult.passedRules.map((ruleCode) => ({
          ruleId: ruleCode,
          message: ruleCode,
        })),
      },
    }

    return generatePermitDocPdf(data)
  }
}
