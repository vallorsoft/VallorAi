import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma, type Opening, type Wall } from '@ai-home-designer/database'
import {
  calculateBrickQuantity,
  calculateLongitudinalRebarQuantity,
  calculateStirrupQuantity,
  deriveLintelSpec,
  type BrickModule,
  type RebarBarSpec,
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
  /** Whether the seeded Material's `unitCostRON` has been checked against a real supplier quote (see Material.specSheet.priceVerified in the seed). */
  priceVerified?: boolean
  /**
   * Whether the geometric quantity itself traces to a cited default (as
   * opposed to a convention-only default the user still has to confirm — e.g.
   * `Roof.overhangVerified` on the roof line). Absent on lines where the
   * quantity itself has no verification concept (wall assembly, foundation
   * with a cited STAS 6054-77 locality, etc.).
   */
  verified?: boolean
  /** Free-form note for the UI (e.g. "unverified overhang", "unverified locality"). */
  notes?: string
}

// Default joint dimensions for brick-category materials whose specSheet
// doesn't state its own (e.g. the solid-brick reference material) — per
// NE 001/1996 / C 126-75 researched defaults. Materials with their own
// piecesPerM2 (e.g. the Leier N+F default) skip this path entirely.
const DEFAULT_BED_JOINT_MM = 12
const DEFAULT_HEAD_JOINT_MM = 10

// ---------------------------------------------------------------------------
// Labor cost rates (RON/m²) — Romanian market estimates, Bursa Construcțiilor
// 2024. No official RO labor-cost index exists, so ALL labor lines are always
// priceVerified: false. Rates are direct manpower only (no material, no
// equipment); actual rates vary by region, contractor type and site access.
// ---------------------------------------------------------------------------
const LABOR_RATES_RON_PER_M2 = {
  foundation: 350, // Fundație — săpătură, cofraj, betonare
  masonry:    280, // Zidărie (blocuri ceramice/beton) — zidar + ajutor
  plaster:     80, // Tencuială interioară/exterioară (per m² netă față)
  insulation:  60, // Termoizolație (per m² față exterioară netă)
  painting:    35, // Vopsitorie (per m² netă față)
  roofing:    200, // Învelitoare — montaj șipcuire + țiglă
  structural: 400, // Structură confinată — stâlpișori, centuri, buiandruguri
  carpentry:  150, // Tâmplărie — montaj uși + ferestre (per m² deschidere)
} as const

// Legea 227/2015 (Codul Fiscal) — standard TVA rate for construction.
// A reduced 5% rate applies when the total price ≤ 600,000 RON and the
// usable floor area ≤ 120 m² (Codul Fiscal art. 291). Not auto-applied here
// — a future Project.vatRateOverride field would handle that case.
const VAT_RATE = 0.19

// Default strip-footing width for foundation labor area estimate — matches
// deriveStripFootingWidthMm(380mm wall) = 380 + 2×150 = 680mm, per
// NP 112-2014 constructive minimums (same formula the foundation BOQ uses).
const DEFAULT_FOOTING_WIDTH_M = 0.68

// Labor-line annotation surfaced to the UI as an "unverified" note.
const LABOR_NOTE = 'Estimat Bursa Construcțiilor 2024 — neconfirmat'

// Storey height for tie-column/wall volume defaults when a Wall.height is
// absent. Matches Wall.height's Prisma default (2.7m) and the 3D viewer's
// LEVEL_HEIGHT_M — not a storey-height spec (see CLAUDE.md's "AI rooms →
// generated walls" section).
const DEFAULT_STOREY_HEIGHT_M = 2.7

// Foundations and confining-element concrete/rebar all use these three
// seeded generic-default materials (see packages/database/prisma/seed.ts).
// Names must stay in sync with the seed.
const MATERIAL_LEAN_CONCRETE = 'Beton de egalizare C8/10'
const MATERIAL_FOUNDATION_CONCRETE = 'Beton C16/20'
const MATERIAL_CONFINING_CONCRETE = 'Beton C12/15'
const MATERIAL_REBAR = 'Oțel beton B500C'
const MATERIAL_LINTEL = 'Buiandrug prefabricat'
const MATERIAL_ROOF = 'Țiglă ceramică Tondach standard'

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

  async estimateByArea(houseId: string): Promise<{
    breakdown: CostItem[]
    subtotalMaterials: number
    subtotalLabor: number
    vatAmount: number
    grandTotal: number
    /** Alias for grandTotal — preserved for backward-compatibility with existing callers. */
    total: number
    currency: string
  }> {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: { rooms: true, walls: { include: { openings: true } } },
    })
    if (!house) throw new NotFoundException('House not found')

    const totalArea = house.totalArea ?? house.rooms.reduce((s, r) => s + r.area, 0)

    // Real BOQ lines, category by category. Each helper falls back to an
    // empty list when the underlying data isn't there yet (e.g. no walls
    // → no perimeter → no foundation lines) — the flat area-rate for that
    // category then stays in the breakdown as before.
    const wallBoq = await this.calculateWallAssemblyBoq(house.walls)
    const foundationBoq = await this.calculateFoundationBoq(houseId, house.walls)
    const structuralBoq = await this.calculateStructuralBoq(houseId, house.walls)
    const lintelBoq = await this.calculateLintelBoq(houseId, house.walls)
    const roofBoq = await this.calculateRoofBoq(houseId, house.walls)

    // Real per-wall-layer data now covers masonry/plastering/painting/insulation
    // more accurately than a flat per-m²-of-floor-area guess — drop those flat
    // categories in favor of the real numbers once walls exist. Same idea
    // for `structure` (once foundation BOQ is generated) and `roof` (once
    // roof BOQ is generated). Categories without a real BOQ source yet
    // (MEP, finishes, etc.) keep the flat-rate rollup.
    const flatCategoriesToReplace = new Set<string>()
    if (wallBoq.length > 0) {
      for (const c of ['masonry', 'plastering', 'painting', 'insulation']) {
        flatCategoriesToReplace.add(c)
      }
    }
    if (foundationBoq.length > 0 || structuralBoq.length > 0) {
      flatCategoriesToReplace.add('structure')
    }
    if (roofBoq.length > 0) {
      flatCategoriesToReplace.add('roof')
    }

    const flatCategories: CostItem[] = Object.entries(this.romanianRates)
      .filter(([category]) => !flatCategoriesToReplace.has(category))
      .map(([category, rate]) => ({
        category,
        name: this.categoryLabel(category),
        quantity: totalArea,
        unit: 'm²',
        unitPrice: rate,
      }))

    const materialLines: CostItem[] = [
      ...flatCategories,
      ...wallBoq,
      ...foundationBoq,
      ...structuralBoq,
      ...lintelBoq,
      ...roofBoq,
    ]
    const subtotalMaterials = Math.round(
      materialLines.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100,
    ) / 100

    // Labor lines — Bursa Construcțiilor 2024 market estimates derived from
    // house geometry; all priceVerified: false (no official RO labor index).
    const laborLines = this.calculateLaborLines(totalArea, house.walls, roofBoq)
    const subtotalLabor = Math.round(
      laborLines.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100,
    ) / 100

    // TVA 19% (Legea 227/2015). Applied to the full materials + labor subtotal.
    // Reduced 5% may apply for residential buildings (Codul Fiscal art. 291) —
    // not auto-applied here; see the notes field for conditions.
    const vatBase = subtotalMaterials + subtotalLabor
    const vatAmount = Math.round(vatBase * VAT_RATE * 100) / 100
    const grandTotal = Math.round((vatBase + vatAmount) * 100) / 100

    const taxLine: CostItem = {
      category: 'tax',
      name: 'TVA 19%',
      quantity: 1,
      unit: 'RON',
      unitPrice: vatAmount,
      priceVerified: false,
      notes: 'TVA standard 19% (Legea 227/2015). Cotă redusă 5% posibilă dacă prețul ≤ 600.000 RON și suprafața utilă ≤ 120 m² (Codul Fiscal art. 291).',
    }

    const breakdown: CostItem[] = [...materialLines, ...laborLines, taxLine]

    await prisma.costEstimate.upsert({
      where: { projectId: house.projectId },
      create: {
        projectId: house.projectId,
        total: grandTotal,
        currency: 'RON',
        breakdown: breakdown as never,
      },
      update: { total: grandTotal, breakdown: breakdown as never },
    })

    return {
      breakdown,
      subtotalMaterials,
      subtotalLabor,
      vatAmount,
      grandTotal,
      total: grandTotal,
      currency: 'RON',
    }
  }

  /**
   * Labor cost lines derived from house geometry. All rates are Bursa
   * Construcțiilor 2024 market estimates — no official Romanian labor-cost
   * index exists — so every line carries priceVerified: false.
   *
   * Quantity conventions:
   *   foundation  — ground-floor bearing-wall perimeter × footing width (m²)
   *   masonry     — gross wall face area, all walls (m²)
   *   plaster     — net wall area (gross − openings), all walls (m²)
   *   insulation  — exterior net wall area (m²)
   *   painting    — same as plaster, net wall area (m²)
   *   structural  — load-bearing wall face area (tie-columns + centuri proxy, m²)
   *   roofing     — roof covering area from roof BOQ, else floor area (m²)
   *   carpentry   — total openings area (doors + windows, m²)
   *
   * Lines with zero quantity are omitted (e.g. carpentry when there are no
   * openings yet, roofing when there's no roof).
   */
  private calculateLaborLines(
    totalArea: number,
    walls: (Wall & { openings: Opening[] })[],
    roofBoq: CostItem[],
  ): CostItem[] {
    if (walls.length === 0) return []

    const wallLen = (w: Wall) => Math.hypot(w.endX - w.startX, w.endY - w.startY)

    const allWallAreaM2 = walls.reduce((s, w) => s + wallLen(w) * w.height, 0)
    const exteriorWallAreaM2 = walls
      .filter((w) => w.isExterior)
      .reduce((s, w) => s + wallLen(w) * w.height, 0)
    const bearingWallAreaM2 = walls
      .filter((w) => w.isExterior || w.isLoad)
      .reduce((s, w) => s + wallLen(w) * w.height, 0)

    const totalOpeningsAreaM2 = walls.reduce(
      (s, w) => s + w.openings.reduce((os, o) => os + o.width * o.height, 0),
      0,
    )
    const netWallAreaM2 = Math.max(0, allWallAreaM2 - totalOpeningsAreaM2)
    const exteriorNetWallAreaM2 = Math.max(0, exteriorWallAreaM2 - totalOpeningsAreaM2)

    // Foundation labor: footing footprint area = perimeter × footing width.
    const groundBearingPerimeterM = walls
      .filter((w) => w.floor === 0 && (w.isExterior || w.isLoad))
      .reduce((s, w) => s + wallLen(w), 0)
    const foundationLaborAreaM2 = groundBearingPerimeterM * DEFAULT_FOOTING_WIDTH_M

    // Roof labor: use the already-derived covering area; fall back to floor area.
    const roofCovering = roofBoq.find((l) => l.category === 'roof-covering')
    const roofLaborAreaM2 = roofCovering ? roofCovering.quantity : totalArea

    const make = (name: string, rawQty: number, rate: number): CostItem | null => {
      const quantity = Math.round(rawQty * 100) / 100
      if (quantity <= 0) return null
      return {
        category: 'labor',
        name,
        quantity,
        unit: 'm²',
        unitPrice: rate,
        priceVerified: false,
        notes: LABOR_NOTE,
      }
    }

    return [
      make('Manoperă fundație',      foundationLaborAreaM2,  LABOR_RATES_RON_PER_M2.foundation),
      make('Manoperă zidărie',        allWallAreaM2,          LABOR_RATES_RON_PER_M2.masonry),
      make('Manoperă tencuială',      netWallAreaM2,          LABOR_RATES_RON_PER_M2.plaster),
      make('Manoperă termoizolație',  exteriorNetWallAreaM2,  LABOR_RATES_RON_PER_M2.insulation),
      make('Manoperă vopsitorie',     netWallAreaM2,          LABOR_RATES_RON_PER_M2.painting),
      make('Manoperă structură',      bearingWallAreaM2,      LABOR_RATES_RON_PER_M2.structural),
      make('Manoperă învelitoare',    roofLaborAreaM2,        LABOR_RATES_RON_PER_M2.roofing),
      make('Manoperă tâmplărie',      totalOpeningsAreaM2,    LABOR_RATES_RON_PER_M2.carpentry),
    ].filter((l): l is CostItem => l !== null)
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
   * Real strip-footing BOQ from the house's Foundation row (auto-provisioned
   * via `HousesService.getFoundation` from STAS 6054-77 + NP 112-2014
   * constructive minimums) and the ground-floor load-bearing wall perimeter.
   * Emits four lines:
   *   1. Lean concrete (`Beton de egalizare C8/10`) m³
   *   2. Structural concrete (`Beton C16/20`) m³
   *   3. Transverse (resistance) rebar (`Oțel beton B500C`) kg
   *   4. Longitudinal (distribution) rebar (`Oțel beton B500C`) kg
   * Returns `[]` when the house has no ground-floor load-bearing walls yet
   * (no perimeter to compute a footing run from) — the flat `structure`
   * area-rate then stays in the breakdown.
   */
  private async calculateFoundationBoq(
    houseId: string,
    walls: Wall[],
  ): Promise<CostItem[]> {
    const groundBearingWalls = walls.filter(
      (w) => w.floor === 0 && (w.isExterior || w.isLoad),
    )
    if (groundBearingWalls.length === 0) return []
    const perimeterM = groundBearingWalls.reduce(
      (s, w) => s + Math.hypot(w.endX - w.startX, w.endY - w.startY),
      0,
    )
    if (perimeterM <= 0) return []

    const foundation = await this.housesService.getFoundation(houseId)
    if (!foundation) return []

    const widthM = foundation.widthMm / 1000
    const depthM = foundation.depthMm / 1000
    const leanConcreteThicknessM = foundation.assemblyLayers.find(
      (l) => l.material.name === MATERIAL_LEAN_CONCRETE,
    )?.thicknessMm
    const leanConcreteVolumeM3 = ((leanConcreteThicknessM ?? 0) / 1000) * widthM * perimeterM
    const structuralConcreteVolumeM3 = depthM * widthM * perimeterM

    const [leanMat, structMat, rebarMat] = await Promise.all([
      this.findMaterial(MATERIAL_LEAN_CONCRETE),
      this.findMaterial(MATERIAL_FOUNDATION_CONCRETE),
      this.findMaterial(MATERIAL_REBAR),
    ])

    const lines: CostItem[] = []

    lines.push(
      this.concreteLine('foundation-lean', leanMat, leanConcreteVolumeM3, foundation.depthVerified),
    )
    lines.push(
      this.concreteLine('foundation-structural', structMat, structuralConcreteVolumeM3, foundation.depthVerified),
    )

    // Foundation rebar: two mats. TRANSVERSE bars (resistance, perpendicular
    // to the wall) are spaced along the length; LONGITUDINAL bars
    // (distribution, along the wall) span the length and are stacked across
    // the width. Both flow through `calculateLongitudinalRebarQuantity` — for
    // the transverse mat, the element's axes are swapped: bars along the
    // "long axis" become bars across the footing width, so the returned
    // barLength is the transverse span (widthMm) and the returned barCount is
    // the number of transverse bars along the perimeter.
    const perimeterMm = perimeterM * 1000
    for (const spec of foundation.reinforcementSpecs) {
      const barSpec: RebarBarSpec = {
        diameterMm: spec.barDiameterMm,
        spacingMm: spec.spacingMm,
        coverMm: spec.coverMm,
        role: spec.role,
      }
      const dims =
        spec.role === 'TRANSVERSE'
          ? { lengthMm: foundation.widthMm, widthMm: perimeterMm }
          : { lengthMm: perimeterMm, widthMm: foundation.widthMm }
      const qty = calculateLongitudinalRebarQuantity(dims, barSpec)
      lines.push({
        category: `foundation-rebar-${spec.role.toLowerCase()}`,
        name: `${rebarMat.name} Ø${spec.barDiameterMm}`,
        quantity: Math.round(qty.totalWeightKg * 100) / 100,
        unit: 'kg',
        unitPrice: rebarMat.unitCostRON,
        standardRef: rebarMat.standardRef ?? undefined,
        priceVerified: this.priceVerified(rebarMat),
      })
    }

    return lines
  }

  /**
   * Confined-masonry structural BOQ: tie-column (stâlpișor) + centură
   * concrete and reinforcement (LONGITUDINAL + STIRRUP), per the CR6-2013
   * modules already shipped in bim-engine. Each element emits one concrete
   * line (`Beton C12/15`) and up to two rebar lines (`Oțel beton B500C`),
   * aggregated across all tie-columns / all centuri respectively.
   * Returns `[]` when the house has no walls yet (no tie-column or centura
   * rows) — the flat `structure` area-rate then covers the whole category.
   */
  private async calculateStructuralBoq(
    houseId: string,
    walls: Wall[],
  ): Promise<CostItem[]> {
    if (walls.length === 0) return []
    const [tieColumns, centuri] = await Promise.all([
      this.housesService.getTieColumns(houseId),
      this.housesService.getCenturi(houseId),
    ])
    if (tieColumns.length === 0 && centuri.length === 0) return []

    const [confiningMat, rebarMat] = await Promise.all([
      this.findMaterial(MATERIAL_CONFINING_CONCRETE),
      this.findMaterial(MATERIAL_REBAR),
    ])

    const lines: CostItem[] = []

    // Tie-columns: one per S1/S2/S3 placement, each 250×250 × storey height
    // (uses the max wall height on the same floor, fallback 2.7m). Aggregate
    // volume/rebar across all columns into a single line-per-category so the
    // breakdown stays legible.
    if (tieColumns.length > 0) {
      const wallsByFloor = new Map<number, Wall[]>()
      for (const w of walls) {
        const arr = wallsByFloor.get(w.floor) ?? []
        arr.push(w)
        wallsByFloor.set(w.floor, arr)
      }

      let concreteM3 = 0
      const rebarByDiameter = new Map<number, { role: string; kg: number }>()

      for (const column of tieColumns) {
        const floorWalls = wallsByFloor.get(column.floor) ?? []
        const storeyHeightM = floorWalls.reduce(
          (max, w) => Math.max(max, w.height),
          0,
        ) || DEFAULT_STOREY_HEIGHT_M
        const crossSectionM = column.crossSectionMm / 1000
        concreteM3 += crossSectionM * crossSectionM * storeyHeightM

        for (const spec of column.reinforcementSpecs) {
          if (spec.role === 'LONGITUDINAL') {
            // Fixed corner-bar count (see confined-masonry.ts + `barCount`
            // on ReinforcementSpec): `barCount` bars, each running the
            // storey height minus 2× cover.
            const barCount = spec.barCount ?? 4
            const barLengthM = Math.max(0, storeyHeightM - (2 * spec.coverMm) / 1000)
            const totalLengthM = barCount * barLengthM
            const kg = totalLengthM * this.rebarKgPerMeter(spec.barDiameterMm)
            const entry = rebarByDiameter.get(spec.barDiameterMm) ?? { role: 'LONGITUDINAL', kg: 0 }
            entry.kg += kg
            rebarByDiameter.set(spec.barDiameterMm, entry)
          } else if (spec.role === 'STIRRUP') {
            const qty = calculateStirrupQuantity(
              {
                lengthMm: storeyHeightM * 1000,
                crossSectionAMm: column.crossSectionMm,
                crossSectionBMm: column.crossSectionMm,
              },
              {
                diameterMm: spec.barDiameterMm,
                spacingMm: spec.spacingMm,
                coverMm: spec.coverMm,
                role: 'STIRRUP',
              },
            )
            const entry = rebarByDiameter.get(spec.barDiameterMm) ?? { role: 'STIRRUP', kg: 0 }
            entry.kg += qty.totalWeightKg
            rebarByDiameter.set(spec.barDiameterMm, entry)
          }
        }
      }

      if (concreteM3 > 0) {
        lines.push(
          this.concreteLine('tie-column-concrete', confiningMat, concreteM3),
        )
      }
      for (const [diameter, { role, kg }] of rebarByDiameter) {
        lines.push({
          category: `tie-column-rebar-${role.toLowerCase()}`,
          name: `${rebarMat.name} Ø${diameter}`,
          quantity: Math.round(kg * 100) / 100,
          unit: 'kg',
          unitPrice: rebarMat.unitCostRON,
          standardRef: rebarMat.standardRef ?? undefined,
          priceVerified: this.priceVerified(rebarMat),
        })
      }
    }

    // Centuri: one per load-bearing wall × floor level (see centura.ts). Each
    // centura has real length (its host wall's length), width (wall thickness)
    // and height (slab thickness × 1 or × 2 for exterior).
    if (centuri.length > 0) {
      const wallById = new Map(walls.map((w) => [w.id, w]))
      let concreteM3 = 0
      const rebarByDiameter = new Map<number, { role: string; kg: number }>()

      for (const centura of centuri) {
        const wall = wallById.get(centura.wallId)
        if (!wall) continue
        const wallLengthM = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY)
        const heightM = centura.heightMm / 1000
        const widthM = centura.widthMm / 1000
        concreteM3 += heightM * widthM * wallLengthM

        for (const spec of centura.reinforcementSpecs) {
          if (spec.role === 'LONGITUDINAL') {
            // barCount bars, each running the wall length minus 2× cover.
            const barCount = spec.barCount ?? 4
            const barLengthM = Math.max(0, wallLengthM - (2 * spec.coverMm) / 1000)
            const totalLengthM = barCount * barLengthM
            const kg = totalLengthM * this.rebarKgPerMeter(spec.barDiameterMm)
            const entry = rebarByDiameter.get(spec.barDiameterMm) ?? { role: 'LONGITUDINAL', kg: 0 }
            entry.kg += kg
            rebarByDiameter.set(spec.barDiameterMm, entry)
          } else if (spec.role === 'STIRRUP') {
            const qty = calculateStirrupQuantity(
              {
                lengthMm: wallLengthM * 1000,
                crossSectionAMm: centura.heightMm,
                crossSectionBMm: centura.widthMm,
              },
              {
                diameterMm: spec.barDiameterMm,
                spacingMm: spec.spacingMm,
                coverMm: spec.coverMm,
                role: 'STIRRUP',
              },
            )
            const entry = rebarByDiameter.get(spec.barDiameterMm) ?? { role: 'STIRRUP', kg: 0 }
            entry.kg += qty.totalWeightKg
            rebarByDiameter.set(spec.barDiameterMm, entry)
          }
        }
      }

      if (concreteM3 > 0) {
        lines.push(
          this.concreteLine('centura-concrete', confiningMat, concreteM3),
        )
      }
      for (const [diameter, { role, kg }] of rebarByDiameter) {
        lines.push({
          category: `centura-rebar-${role.toLowerCase()}`,
          name: `${rebarMat.name} Ø${diameter}`,
          quantity: Math.round(kg * 100) / 100,
          unit: 'kg',
          unitPrice: rebarMat.unitCostRON,
          standardRef: rebarMat.standardRef ?? undefined,
          priceVerified: this.priceVerified(rebarMat),
        })
      }
    }

    return lines
  }

  /**
   * Prefabricated lintel line: one `Buiandrug prefabricat` per door/window
   * opening on the house (matching the confined-masonry module's stance —
   * every opening gets a lintel by default). The Lintel DB row itself isn't
   * needed to price this — the seeded material is the only price input, and
   * the row's dimensions carry no unit-cost information (the material is
   * seeded per-piece). Aggregated as one line with the total count.
   */
  private async calculateLintelBoq(houseId: string, walls: Wall[]): Promise<CostItem[]> {
    if (walls.length === 0) return []
    // Openings live on Wall rows; sum via the walls collection so we don't
    // do a second query.
    const openings = await prisma.opening.findMany({ where: { houseId } })
    if (openings.length === 0) return []

    const lintelMat = await this.findMaterial(MATERIAL_LINTEL)
    // Sanity-check: the derived spec here mirrors what HousesService.getLintel
    // would persist — same bim-engine primitive, no invented numbers. We
    // deliberately don't create Lintel rows from the cost engine (a read-only
    // BOQ shouldn't mutate structural data as a side effect).
    for (const o of openings) {
      const wall = walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      deriveLintelSpec(o.width * 1000, wall.thickness * 1000)
    }

    return [
      {
        category: 'lintel',
        name: lintelMat.name,
        quantity: openings.length,
        unit: 'buc',
        unitPrice: lintelMat.unitCostRON,
        standardRef: lintelMat.standardRef ?? undefined,
        priceVerified: this.priceVerified(lintelMat),
      },
    ]
  }

  /**
   * Ceramic-tile roof line: the topmost-floor footprint (from the exterior
   * wall bounding box) is extended by `Roof.overhangM` on all four sides,
   * and the resulting flat area is divided by `cos(pitch)` — a steeper roof
   * needs more tile per m² of footprint. Emits one `Țiglă ceramică Tondach
   * standard` line. `overhangVerified` flows to the line's `verified` flag
   * (mirroring `Material.specSheet.priceVerified`'s surfacing pattern in the
   * UI). Returns `[]` when there are no walls yet (no footprint to extend).
   */
  private async calculateRoofBoq(houseId: string, walls: Wall[]): Promise<CostItem[]> {
    if (walls.length === 0) return []
    const roof = await this.housesService.getRoof(houseId)
    if (!roof) return []

    const topFloor = walls.reduce((max, w) => Math.max(max, w.floor), 0)
    const topWalls = walls.filter((w) => w.floor === topFloor && w.isExterior)
    const source = topWalls.length > 0 ? topWalls : walls.filter((w) => w.floor === topFloor)
    if (source.length === 0) return []

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of source) {
      minX = Math.min(minX, w.startX, w.endX)
      minY = Math.min(minY, w.startY, w.endY)
      maxX = Math.max(maxX, w.startX, w.endX)
      maxY = Math.max(maxY, w.startY, w.endY)
    }
    const footprintLengthM = Math.max(0, maxX - minX) + 2 * roof.overhangM
    const footprintWidthM = Math.max(0, maxY - minY) + 2 * roof.overhangM
    if (footprintLengthM <= 0 || footprintWidthM <= 0) return []

    const pitchRad = (roof.pitchDeg * Math.PI) / 180
    // FLAT roof: cos(0)=1, so this reduces to the flat footprint area — the
    // 1/cos slope factor is only meaningful for a pitched roof.
    const slopeFactor = roof.pitchDeg === 0 ? 1 : 1 / Math.cos(pitchRad)
    const roofAreaM2 = footprintLengthM * footprintWidthM * slopeFactor

    const roofMat = roof.material ?? (await this.findMaterial(MATERIAL_ROOF))
    const priceVerified = this.priceVerified(roofMat)

    const notes: string[] = []
    if (!roof.overhangVerified) notes.push('unverified overhang')
    if (!roof.pitchVerified) notes.push('unverified pitch')

    return [
      {
        category: 'roof-covering',
        name: roofMat.name,
        quantity: Math.round(roofAreaM2 * 100) / 100,
        unit: 'm²',
        unitPrice: roofMat.unitCostRON,
        standardRef: roofMat.standardRef ?? undefined,
        priceVerified,
        // Geometric verification: `pitchVerified` reflects whether the
        // cited-default pitch is in play; `overhangVerified` reflects the
        // (convention-only) overhang. Both must be true for the line's
        // quantity to be "verified" end-to-end.
        verified: roof.pitchVerified && roof.overhangVerified,
        notes: notes.length > 0 ? notes.join('; ') : undefined,
      },
    ]
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

  /**
   * SR 438-1:2012-class reinforcing steel weight per meter for a given
   * diameter (mm). Matches bim-engine's calculateLongitudinalRebarQuantity /
   * calculateStirrupQuantity density constant (7850 kg/m³) so the two paths
   * stay in numerical agreement.
   */
  private rebarKgPerMeter(diameterMm: number): number {
    const areaM2 = Math.PI * (diameterMm / 2000) ** 2
    return areaM2 * 7850
  }

  private concreteLine(
    category: string,
    material: { name: string; unitCostRON: number; standardRef: string | null; specSheet: unknown },
    volumeM3: number,
    verified?: boolean,
  ): CostItem {
    return {
      category,
      name: material.name,
      quantity: Math.round(volumeM3 * 1000) / 1000,
      unit: 'm³',
      unitPrice: material.unitCostRON,
      standardRef: material.standardRef ?? undefined,
      priceVerified: this.priceVerified(material),
      verified,
    }
  }

  private priceVerified(material: { specSheet: unknown }): boolean {
    const spec = (material.specSheet ?? {}) as Record<string, unknown>
    return spec.priceVerified === true
  }

  private async findMaterial(name: string) {
    return prisma.material.findFirstOrThrow({
      where: { name, source: 'GENERIC_DEFAULT' },
    })
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
