import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

@Injectable()
export class AdminService {
  async getStats() {
    const [userCount, projectCount, houseCount, materialCount] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.house.count(),
      prisma.material.count(),
    ])
    return { userCount, projectCount, houseCount, materialCount }
  }

  async listUsers(page = 1, perPage = 50) {
    const skip = (page - 1) * perPage
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isVerified: true,
          createdAt: true,
          language: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.user.count(),
    ])
    return { users, total, page, perPage }
  }

  async setUserRole(targetUserId: string, role: string) {
    return prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    })
  }
}
