import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

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
        style: project.style,
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
    metadata?: Record<string, unknown>
  }) {
    return prisma.document.create({
      data: {
        projectId,
        type: data.type,
        title: data.title,
        fileUrl: data.fileUrl,
        metadata: data.metadata as never,
      },
    })
  }

  async deleteDocument(documentId: string) {
    return prisma.document.delete({ where: { id: documentId } })
  }

  generateDxfPlaceholder(projectId: string): string {
    // DXF export placeholder — real implementation requires a CAD library
    return `; DXF Export placeholder for project ${projectId}\n; Integrate with dxf-writer or ezdxf for full output`
  }
}
