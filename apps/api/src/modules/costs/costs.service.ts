import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma, type Opening, type Wall } from '@ai-home-designer/database'
import {
  calculateBrickQuantity,
  type BrickModule,
  type WallDimensions,
  type WallOpeningMm,
} from '@ai-home-designer/bim-engine'
import { HousesService } from '../houses/houses.service'

export interface CostItem {
  category: string
  name: string
  quantity: number
  unit: string
  unitPrice: number
  /** Set on real bill-of-quantities lines derived from a Material — absent on the flat area-rate fallback lines. */
  standardRef?: string
  priceVerified?: boolean
}

// Default joint dimensions for brick-category materials whose specSheet
// doesn't state its own (e.g. the solid-brick reference material) — per
// NE 001/1996 / C 126-75 researched defaults. Materials with their own
// piecesPerM2 (e.g. the Leier N+F default) skip this path entirely.
const DEFAULT_BED_JOINT_MM = 12
const DEFAULT_HEAD_JOINT_MM = 10

@Injectable()
export class CostsService {
  constructor(private readonly housesService: HousesService) {}

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
      include: { rooms: true, walls: { include: { openings: true } } },
    })
    if (!house) throw new NotFoundException('House not found')

    const totalArea = house.totalArea ?? house.rooms.reduce((s, r) => s + r.area, 0)
    const wallBoq = await this.calculateWallAssemblyBoq(house.walls)
    // Real per-wall-layer data now covers masonry/plastering/painting/insulation
    // more accurately than a flat per-m²-of-floor-area guess — drop those flat
    // categories in favor of the real numbers once walls exist. Categories
    // without a real BOQ source yet (foundation, roof, MEP, finishes...) keep
    // the flat-rate rollup.
    const flatCategoriesToReplace = wallBoq.length > 0
      ? new Set(['masonry', 'plastering', 'painting', 'insulation'])
      : new Set<string>()

    const flatCategories: CostItem[] = Object.entries(this.romanianRates)
      .filter(([category]) => !flatCategoriesToReplace.has(category))
      .map(([category, rate]) => ({
        category,
        name: this.categoryLabel(category),
        quantity: totalArea,
        unit: 'm²',
        unitPrice: rate,
      }))

    const breakdown: CostItem[] = [...flatCategories, ...wallBoq]
    const total = breakdown.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

    await prisma.costEstimate.upsert({
      where: { projectId: house.projectId },
      create: { projectId: house.projectId, total, currency: 'RON', breakdown: breakdown as never },
      update: { total, breakdown: breakdown as never },
    })

    return { breakdown, total, currency: 'RON' }
  }

  /**
   * Real, bottom-up bill-of-quantities lines from each wall's actual layer
   * assembly (see HousesService.getWallLayers) — replaces the flat
   * masonry/plastering/painting/insulation area-rate guesses once wall data
   * exists. Door/window openings are subtracted: area-based layers (render,
   * plaster, paint, insulation…) use the net wall area, and the geometric
   * brick fallback runs bim-engine's opening-aware coursing count.
   */
  private async calculateWallAssemblyBoq(
    walls: (Wall & { openings: Opening[] })[],
  ): Promise<CostItem[]> {
    const lines: CostItem[] = []

    for (const wall of walls) {
      const lengthM = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY)
      const grossAreaM2 = lengthM * wall.height
      const openingsAreaM2 = wall.openings.reduce((s, o) => s + o.width * o.height, 0)
      const areaM2 = Math.max(0, grossAreaM2 - openingsAreaM2)
      const layers = await this.housesService.getWallLayers(wall.id)

      for (const layer of layers) {
        const material = layer.material
        const specSheet = (material.specSheet ?? {}) as Record<string, unknown>
        const quantity = this.calculateLayerQuantity(material.unit, areaM2, lengthM, wall, layer.thicknessMm, specSheet)

        lines.push({
          category: `wall-${layer.function.toLowerCase()}`,
          name: material.name,
          quantity,
          unit: material.unit.toLowerCase(),
          unitPrice: material.unitCostRON,
          standardRef: material.standardRef ?? undefined,
          priceVerified: specSheet.priceVerified === true,
        })
      }
    }

    return lines
  }

  private calculateLayerQuantity(
    unit: string,
    areaM2: number,
    lengthM: number,
    wall: Wall & { openings: Opening[] },
    thicknessMm: number,
    specSheet: Record<string, unknown>,
  ): number {
    if (unit === 'BUC') {
      if (typeof specSheet.piecesPerM2 === 'number') {
        return areaM2 * specSheet.piecesPerM2
      }
      // Fallback: derive quantity geometrically for brick-category materials
      // that don't state a direct piecesPerM2 shortcut.
      const brick: BrickModule = {
        lengthMm: Number(specSheet.lengthMm ?? 0),
        heightMm: Number(specSheet.heightMm ?? 0),
        widthMm: Number(specSheet.widthMm ?? 0),
        bedJointMm: DEFAULT_BED_JOINT_MM,
        headJointMm: DEFAULT_HEAD_JOINT_MM,
      }
      const wallDims: WallDimensions = {
        lengthMm: lengthM * 1000,
        heightMm: wall.height * 1000,
        thicknessMm: wall.thickness * 1000,
      }
      const openings: WallOpeningMm[] = wall.openings.map((o) => ({
        positionMm: o.position * 1000,
        widthMm: o.width * 1000,
        heightMm: o.height * 1000,
        sillHeightMm: o.sillHeight * 1000,
      }))
      return calculateBrickQuantity(wallDims, brick, openings).wholeBrickCount
    }
    if (unit === 'M3') {
      return areaM2 * (thicknessMm / 1000)
    }
    // M2 default — render, insulation, plaster, paint are all specified per m².
    return areaM2
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
