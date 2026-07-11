import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'
import { generateFloorPlanPdf, FloorPlanData } from './floor-plan-pdf'
import { generateIfcContent, IfcExportData } from './ifc-generator'

@Injectable()
export class ExportsService {
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

  generateDxfPlaceholder(projectId: string): string {
    // DXF export placeholder — real implementation requires a CAD library
    return `; DXF Export placeholder for project ${projectId}\n; Integrate with dxf-writer or ezdxf for full output`
  }
}
