import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@ai-home-designer/database'

export interface CostItem {
  category: string
  name: string
  quantity: number
  unit: string
  unitPrice: number
}

@Injectable()
export class CostsService {
  // Romanian construction cost rates per m² (RON, 2024 estimates)
  private readonly romanianRates = {
    structure: 800,      // foundation + structural
    masonry: 350,        // walls, partitions
    roof: 200,           // roofing per m² floor area
    insulation: 150,
    windows: 120,        // per m² floor area
    doors: 80,
    electrical: 120,
    plumbing: 180,
    hvac: 200,
    flooring: 150,
    plastering: 100,
    painting: 60,
    tiles: 180,          // bathroom/kitchen avg
    kitchen: 250,        // kitchen furniture avg
    bathroom: 200,       // bathroom fixtures avg
  }

  async estimateByArea(houseId: string): Promise<{ breakdown: CostItem[]; total: number; currency: string }> {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: { rooms: true },
    })
    if (!house) throw new NotFoundException('House not found')

    const totalArea = house.totalArea ?? house.rooms.reduce((s, r) => s + r.area, 0)
    const breakdown: CostItem[] = Object.entries(this.romanianRates).map(([category, rate]) => ({
      category,
      name: this.categoryLabel(category),
      quantity: totalArea,
      unit: 'm²',
      unitPrice: rate,
    }))

    const total = breakdown.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

    await prisma.costEstimate.upsert({
      where: { projectId: house.projectId },
      create: { projectId: house.projectId, total, currency: 'RON', breakdown: breakdown as never },
      update: { total, breakdown: breakdown as never },
    })

    return { breakdown, total, currency: 'RON' }
  }

  async getEstimate(houseId: string) {
    const house = await prisma.house.findUnique({ where: { id: houseId } })
    if (!house) throw new NotFoundException('House not found')
    const estimate = await prisma.costEstimate.findUnique({ where: { projectId: house.projectId } })
    if (!estimate) throw new NotFoundException('No estimate found — run estimate first')
    return estimate
  }

  async getByProject(projectId: string) {
    const estimate = await prisma.costEstimate.findUnique({ where: { projectId } })
    if (!estimate) throw new NotFoundException('No estimate found — run estimate first')
    return estimate
  }

  async estimateByProject(projectId: string) {
    const house = await prisma.house.findUnique({ where: { projectId } })
    if (!house) throw new NotFoundException('House not found for this project')
    return this.estimateByArea(house.id)
  }

  private categoryLabel(key: string): string {
    const labels: Record<string, string> = {
      structure: 'Structură (fundație + schelet)',
      masonry: 'Zidărie și compartimentări',
      roof: 'Acoperiș',
      insulation: 'Termoizolație',
      windows: 'Tâmplărie ferestre',
      doors: 'Uși',
      electrical: 'Instalație electrică',
      plumbing: 'Instalație sanitară',
      hvac: 'Climatizare / încălzire',
      flooring: 'Pardoseli',
      plastering: 'Tencuieli',
      painting: 'Vopsitorii',
      tiles: 'Faianță și gresie',
      kitchen: 'Mobilier bucătărie',
      bathroom: 'Obiecte sanitare',
    }
    return labels[key] ?? key
  }
}
