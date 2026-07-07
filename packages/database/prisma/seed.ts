import { PrismaClient, Prisma, MaterialCategory, MaterialUnit } from '../src/generated'

const prisma = new PrismaClient()

// Generic-default Material catalog, grounded in real Romanian/Hungarian
// construction standards researched for this feature (not invented):
//   - Leiertherm 38 N+F block: manufacturer product literature (Leier),
//     cross-checked across two independent retail/technical sources.
//     Exact axis mapping (length/width/height) and price should still be
//     confirmed against the official Leier datasheet before high-stakes use.
//   - Brick dims (small solid): STAS 2945/73
//   - Rebar: SR 438-1:2012 (steel grade B500C, priced per kg — the specific
//     bar diameter/spacing/cover for an element lives on ReinforcementSpec,
//     not here)
//   - Concrete cover defaults: Eurocode 2 / SR EN 1992-1-1 Table 4.4N
//     structural-class-S4 values, which NE 012/1-2022 Annex J is based on —
//     a structural engineer must confirm the exact Romanian national-annex
//     figure before construction-grade use.
//   - Plaster/glet layers: NE 001/1996
//   - Exterior EPS insulation: C107/3-2005
//   - Unit prices (unitCostRON): no official government price index exists;
//     seeded as rough estimates pending verification against a live Bursa
//     Construcțiilor (constructiibursa.ro) bulletin or a real supplier quote.
//     Every row is marked `priceVerified: false` in specSheet so the UI can
//     surface a "verify before quoting" notice — see plan risk #6.

async function main() {
  const materials: Array<{
    category: MaterialCategory
    name: string
    standardRef: string | null
    unit: MaterialUnit
    unitCostRON: number
    specSheet: Prisma.InputJsonValue
  }> = [
    {
      category: 'BLOCK',
      name: 'Leiertherm 38 N+F',
      standardRef: 'Leier Leiertherm 38 N+F',
      unit: 'BUC',
      unitCostRON: 18,
      specSheet: {
        lengthMm: 250,
        widthMm: 380, // wall thickness — this is the "38-as" designation
        heightMm: 238,
        piecesPerM2: 16,
        lambdaWmK: 0.16,
        compressiveStrengthNmm2: 11,
        fireClass: 'A1',
        fireResistance: 'REI120',
        dryDensityKgM3: 690,
        tongueAndGroove: true, // no vertical mortar joint
        mortarConsumptionLPerM2: 26,
        priceVerified: false,
        priceSource: 'Manufacturer literature estimate — confirm with official Leier datasheet/quote',
      },
    },
    {
      category: 'BRICK',
      name: 'Cărămidă plină arsă',
      standardRef: 'STAS 2945/73',
      unit: 'BUC',
      unitCostRON: 1.2,
      specSheet: {
        lengthMm: 240,
        widthMm: 115,
        heightMm: 63,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'CONCRETE',
      name: 'Beton C25/30',
      standardRef: 'NE 012/1-2022, SR EN 206',
      unit: 'M3',
      unitCostRON: 380,
      specSheet: {
        strengthClass: 'C25/30',
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'REBAR',
      name: 'Oțel beton B500C',
      standardRef: 'SR 438-1:2012',
      unit: 'KG',
      unitCostRON: 4.5,
      specSheet: {
        steelGrade: 'B500C',
        densityKgM3: 7850,
        availableDiametersMm: [6, 8, 10, 12, 14, 16, 20, 25, 28, 32],
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'MORTAR',
      name: 'Mortar de zidărie',
      standardRef: 'NE 001/1996 / C 126-75',
      unit: 'M3',
      unitCostRON: 350,
      specSheet: {
        bedJointMm: 12,
        headJointMm: 10,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'INSULATION',
      name: 'Polistiren expandat (EPS) fațadă',
      standardRef: 'C 107/3-2005',
      unit: 'M2',
      unitCostRON: 32,
      specSheet: {
        thicknessMm: 100,
        minThermalResistanceM2KW: 1.8,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'RENDER',
      name: 'Tencuială exterioară (grund)',
      standardRef: 'NE 001/1996',
      unit: 'M2',
      unitCostRON: 28,
      specSheet: {
        thicknessMmMin: 15,
        thicknessMmMax: 20,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'PLASTER',
      name: 'Glet de var/ipsos',
      standardRef: 'NE 001/1996',
      unit: 'M2',
      unitCostRON: 14,
      specSheet: {
        thicknessMmMin: 1,
        thicknessMmMax: 3,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
    {
      category: 'PAINT',
      name: 'Vopsea lavabilă interior',
      standardRef: null,
      unit: 'M2',
      unitCostRON: 9,
      specSheet: {
        coats: 2,
        priceVerified: false,
        priceSource: 'Estimate pending Bursa Construcțiilor verification',
      },
    },
  ]

  for (const material of materials) {
    const existing = await prisma.material.findFirst({
      where: { name: material.name, source: 'GENERIC_DEFAULT' },
    })
    if (existing) {
      await prisma.material.update({ where: { id: existing.id }, data: material })
    } else {
      await prisma.material.create({ data: material })
    }
  }

  console.log(`Seeded ${materials.length} generic-default materials.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
