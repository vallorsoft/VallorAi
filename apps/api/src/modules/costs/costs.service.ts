import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma, type Opening, type Wall } from '@ai-home-designer/database'
import {
  calculateBrickQuantity,
  calculateLongitudinalRebarQuantity,
  calculateStirrupQuantity,
  rebarWeightPerMeterKg,
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
    const structuralBoq = await this.calculateStructuralBoq(house.id, house.walls)
    // Real per-wall-layer data now covers masonry/plastering/painting/insulation
    // more accurately than a flat per-m²-of-floor-area guess — drop those flat
    // categories in favor of the real numbers once walls exist. Likewise the
    // flat `structure` rate is replaced by the real foundation/tie-column/
    // centură/lintel lines once those exist (floor slabs stay unmodeled — a
    // documented gap, not silently re-added as a guess). Categories without a
    // real BOQ source yet (roof, MEP, finishes...) keep the flat-rate rollup.
    const flatCategoriesToReplace = wallBoq.length > 0
      ? new Set(['masonry', 'plastering', 'painting', 'insulation'])
      : new Set<string>()
    if (structuralBoq.length > 0) flatCategoriesToReplace.add('structure')

    const flatCategories: CostItem[] = Object.entries(this.romanianRates)
      .filter(([category]) => !flatCategoriesToReplace.has(category))
      .map(([category, rate]) => ({
        category,
        name: this.categoryLabel(category),
        quantity: totalArea,
        unit: 'm²',
        unitPrice: rate,
      }))

    const breakdown: CostItem[] = [...flatCategories, ...structuralBoq, ...wallBoq]
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

  /**
   * Real bill-of-quantities lines for the auto-provisioned structural
   * elements (Modules 1-3): strip-footing concrete + rebar, tie-column
   * (stâlpișor) concrete + cage steel, centură concrete + steel, and one
   * prefabricated lintel per opening. Replaces the flat `structure` area
   * rate the same way the wall-assembly BOQ replaced the masonry rates.
   * Floor slabs are NOT included — there is no slab model yet, and no rate
   * is invented to paper over that (documented gap).
   *
   * Steel weights are centerline quantities: lap splices, anchorage lengths
   * and stirrup end hooks are excluded (no cited primary-source allowance —
   * see structural-rebar.ts), so real consumption runs somewhat higher.
   */
  private async calculateStructuralBoq(
    houseId: string,
    walls: (Wall & { openings: Opening[] })[],
  ): Promise<CostItem[]> {
    if (walls.length === 0) return []
    const lines: CostItem[] = []

    const rebarMaterial = await prisma.material.findFirst({
      where: { name: 'Oțel beton B500C', source: 'GENERIC_DEFAULT' },
    })
    interface MaterialLike {
      name: string
      unit: string
      unitCostRON: number
      standardRef: string | null
      specSheet: unknown
    }
    const materialLine = (category: string, material: MaterialLike, quantity: number): CostItem => ({
      category,
      name: material.name,
      quantity,
      unit: material.unit.toLowerCase(),
      unitPrice: material.unitCostRON,
      standardRef: material.standardRef ?? undefined,
      priceVerified:
        ((material.specSheet ?? {}) as Record<string, unknown>).priceVerified === true,
    })
    const concreteMaterial = (concreteClass: string) =>
      prisma.material.findFirst({
        where: { name: `Beton ${concreteClass}`, source: 'GENERIC_DEFAULT' },
      })

    // --- Foundation: strip footing under the ground floor's load-bearing walls
    const footingRunM = walls
      .filter((w) => w.floor === 0 && (w.isExterior || w.isLoad))
      .reduce((s, w) => s + Math.hypot(w.endX - w.startX, w.endY - w.startY), 0)
    if (footingRunM > 0) {
      const foundation = await this.housesService.getFoundation(houseId)
      const footingWidthM = foundation.widthMm / 1000
      for (const layer of foundation.assemblyLayers) {
        const volumeM3 = footingRunM * footingWidthM * (layer.thicknessMm / 1000)
        lines.push(materialLine('foundation', layer.material, volumeM3))
      }
      if (rebarMaterial) {
        let steelKg = 0
        for (const spec of foundation.reinforcementSpecs) {
          // TRANSVERSE resistance bars run across the footing width, spaced
          // along the run; LONGITUDINAL distribution bars run along it —
          // the same quantity formula with length/width swapped.
          const element =
            spec.role === 'TRANSVERSE'
              ? { lengthMm: foundation.widthMm, widthMm: footingRunM * 1000 }
              : { lengthMm: footingRunM * 1000, widthMm: foundation.widthMm }
          steelKg += calculateLongitudinalRebarQuantity(element, {
            diameterMm: spec.barDiameterMm,
            spacingMm: spec.spacingMm,
            coverMm: spec.coverMm,
            role: 'LONGITUDINAL',
          }).totalWeightKg
        }
        if (steelKg > 0) lines.push(materialLine('foundation', rebarMaterial, steelKg))
      }
    }

    // --- Tie-columns (stâlpișori)
    const tieColumns = await this.housesService.getTieColumns(houseId)
    if (tieColumns.length > 0) {
      const floorHeightM = new Map<number, number>()
      for (const wall of walls) {
        floorHeightM.set(wall.floor, Math.max(floorHeightM.get(wall.floor) ?? 0, wall.height))
      }
      const concreteByClass = new Map<string, number>()
      let steelKg = 0
      for (const column of tieColumns) {
        const heightM = floorHeightM.get(column.floor) ?? 2.7
        const sideM = column.crossSectionMm / 1000
        concreteByClass.set(
          column.concreteClass,
          (concreteByClass.get(column.concreteClass) ?? 0) + sideM * sideM * heightM,
        )
        for (const spec of column.reinforcementSpecs) {
          if (spec.role === 'LONGITUDINAL') {
            steelKg +=
              (spec.barCount ?? 4) * heightM * rebarWeightPerMeterKg(spec.barDiameterMm)
          } else if (spec.role === 'STIRRUP') {
            steelKg += calculateStirrupQuantity(
              heightM * 1000,
              { widthMm: column.crossSectionMm, heightMm: column.crossSectionMm },
              { diameterMm: spec.barDiameterMm, spacingMm: spec.spacingMm, coverMm: spec.coverMm },
            ).totalWeightKg
          }
        }
      }
      for (const [concreteClass, volumeM3] of concreteByClass) {
        const material = await concreteMaterial(concreteClass)
        if (material) lines.push(materialLine('tie-column', material, volumeM3))
      }
      if (rebarMaterial && steelKg > 0) lines.push(materialLine('tie-column', rebarMaterial, steelKg))
    }

    // --- Centuri (ring beams)
    const centuri = await this.housesService.getCenturi(houseId)
    if (centuri.length > 0) {
      const wallById = new Map(walls.map((w) => [w.id, w]))
      const concreteByClass = new Map<string, number>()
      let steelKg = 0
      for (const centura of centuri) {
        const wall = wallById.get(centura.wallId)
        if (!wall) continue
        const lengthM = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY)
        if (lengthM === 0) continue
        concreteByClass.set(
          centura.concreteClass,
          (concreteByClass.get(centura.concreteClass) ?? 0) +
            lengthM * (centura.widthMm / 1000) * (centura.heightMm / 1000),
        )
        for (const spec of centura.reinforcementSpecs) {
          if (spec.role === 'LONGITUDINAL') {
            const barLengthM = Math.max(0, lengthM - (2 * spec.coverMm) / 1000)
            steelKg +=
              (spec.barCount ?? 4) * barLengthM * rebarWeightPerMeterKg(spec.barDiameterMm)
          } else if (spec.role === 'STIRRUP') {
            steelKg += calculateStirrupQuantity(
              lengthM * 1000,
              { widthMm: centura.widthMm, heightMm: centura.heightMm },
              { diameterMm: spec.barDiameterMm, spacingMm: spec.spacingMm, coverMm: spec.coverMm },
            ).totalWeightKg
          }
        }
      }
      for (const [concreteClass, volumeM3] of concreteByClass) {
        const material = await concreteMaterial(concreteClass)
        if (material) lines.push(materialLine('centura', material, volumeM3))
      }
      if (rebarMaterial && steelKg > 0) lines.push(materialLine('centura', rebarMaterial, steelKg))
    }

    // --- Lintels: one prefabricated unit per opening
    const lintelByMaterial = new Map<string, { material: MaterialLike; quantity: number }>()
    for (const wall of walls) {
      for (const opening of wall.openings) {
        const lintel = await this.housesService.getLintel(opening.id)
        const entry = lintelByMaterial.get(lintel.material.id) ?? {
          material: lintel.material,
          quantity: 0,
        }
        // Per-piece products count units; a per-linear-meter product sums length.
        entry.quantity += lintel.material.unit === 'ML' ? lintel.lengthMm / 1000 : 1
        lintelByMaterial.set(lintel.material.id, entry)
      }
    }
    for (const { material, quantity } of lintelByMaterial.values()) {
      lines.push(materialLine('lintel', material, quantity))
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
