import { Injectable } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

@Injectable()
export class MarketplaceService {
  async listMaterials(opts: { category?: string; supplierId?: string; page?: number; perPage?: number }) {
    const page = opts.page ?? 1
    const perPage = opts.perPage ?? 24
    const skip = (page - 1) * perPage

    const where = {
      source: 'MANUFACTURER' as const,
      ...(opts.category ? { category: opts.category as never } : {}),
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
    }

    const [materials, total] = await Promise.all([
      prisma.material.findMany({
        where,
        orderBy: [{ supplierId: 'asc' }, { name: 'asc' }],
        skip,
        take: perPage,
      }),
      prisma.material.count({ where }),
    ])

    return { materials, total, page, perPage }
  }

  async listSuppliers() {
    const rows = await prisma.material.findMany({
      where: { source: 'MANUFACTURER', supplierId: { not: null } },
      select: { supplierId: true },
      distinct: ['supplierId'],
    })
    return rows.map((r) => r.supplierId).filter(Boolean)
  }

  async getMaterial(id: string) {
    return prisma.material.findUniqueOrThrow({ where: { id } })
  }
}
