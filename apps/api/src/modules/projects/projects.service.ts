import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

@Injectable()
export class ProjectsService {
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
}
