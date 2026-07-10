import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { prisma } from '@ai-home-designer/database'
import { AppModule } from '../src/app.module'
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter'

async function registerAndVerify(
  server: ReturnType<NestFastifyApplication['getHttpServer']>,
  email: string,
  name: string,
): Promise<string> {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Sup3rSecret!', name })
    .expect(201)

  const user = await prisma.user.findUnique({ where: { email } })
  const verifyRes = await request(server)
    .post('/api/v1/auth/verify-email')
    .send({ token: user?.verificationToken })
    .expect(200)

  return verifyRes.body.data.accessToken
}

describe('Cost engine BOQ integration (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
  let houseId: string
  let wallId: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    server = app.getHttpServer()

    const email = `cost-boq-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Cost BOQ Test')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cost BOQ Project' })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    houseId = houseRes.body.data.id

    // A 10m x 2.5m exterior wall -> 25 m² of exterior assembly.
    const wallRes = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 10, endY: 0, floor: 0, height: 2.5, isExterior: true })
      .expect(201)
    wallId = wallRes.body.data.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('computes real per-material BOQ lines from the wall assembly instead of a flat masonry guess', async () => {
    const res = await request(server)
      .post(`/api/v1/costs/houses/${houseId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const breakdown: Array<{
      category: string
      name: string
      quantity: number
      unit: string
      unitPrice: number
      priceVerified?: boolean
    }> = res.body.data.breakdown

    // The flat "masonry" guess must be gone, replaced by real wall-structural lines.
    expect(breakdown.some((l) => l.category === 'masonry')).toBe(false)

    const structuralLine = breakdown.find((l) => l.category === 'wall-structural')
    expect(structuralLine).toBeDefined()
    expect(structuralLine!.name).toBe('Leiertherm 38 N+F')
    // 25 m² * 16 pcs/m² (Leier N+F piecesPerM2) = 400 pieces.
    expect(structuralLine!.quantity).toBeCloseTo(400, 5)
    expect(structuralLine!.priceVerified).toBe(false)

    const renderLine = breakdown.find((l) => l.category === 'wall-render')
    expect(renderLine).toBeDefined()
    expect(renderLine!.quantity).toBeCloseTo(25, 5) // m² default for an M2-unit material

    expect(res.body.data.total).toBeGreaterThan(0)
  })

  it('exposes the same BOQ via GET /costs/projects/:id/estimate (auth + ownership)', async () => {
    // The editor's CostBoqPanel reads via this GET endpoint — it must return
    // the same { breakdown, total, currency } shape as the POST /estimate
    // used above. Ownership guard is checked separately (a stranger's token
    // gets a 403).
    // First fetch the project id off the house we already set up in beforeAll.
    const house = await prisma.house.findUnique({ where: { id: houseId } })
    expect(house).toBeTruthy()
    const projectId = house!.projectId

    // Auth guard: an unauthenticated call must 401.
    await request(server).get(`/api/v1/costs/projects/${projectId}/estimate`).expect(401)

    // Ownership guard: a different user's token must 403.
    const otherToken = await registerAndVerify(
      server,
      `cost-boq-stranger-${Date.now()}@example.com`,
      'Cost BOQ Stranger',
    )
    await request(server)
      .get(`/api/v1/costs/projects/${projectId}/estimate`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)

    // Happy path: the project owner sees real BOQ lines.
    const res = await request(server)
      .get(`/api/v1/costs/projects/${projectId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res.body.data.currency).toBe('RON')
    expect(Array.isArray(res.body.data.breakdown)).toBe(true)
    const structuralLine = res.body.data.breakdown.find(
      (l: { category: string }) => l.category === 'wall-structural',
    )
    expect(structuralLine).toBeDefined()
    expect(structuralLine.name).toBe('Leiertherm 38 N+F')
    expect(res.body.data.total).toBeGreaterThan(0)
  })

  it('subtracts door/window openings from the wall BOQ (net area)', async () => {
    // A 1.5m × 1.2m window -> 1.8 m² subtracted from the 25 m² wall.
    await request(server)
      .post(`/api/v1/houses/${houseId}/openings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ wallId, type: 'WINDOW', position: 4, width: 1.5, height: 1.2, sillHeight: 0.9 })
      .expect(201)

    const res = await request(server)
      .post(`/api/v1/costs/houses/${houseId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const breakdown: Array<{ category: string; name: string; quantity: number }> =
      res.body.data.breakdown

    const structuralLine = breakdown.find((l) => l.category === 'wall-structural')
    // 23.2 m² net * 16 pcs/m² (Leier N+F piecesPerM2) = 371.2 pieces.
    expect(structuralLine!.quantity).toBeCloseTo((25 - 1.8) * 16, 5)

    const renderLine = breakdown.find((l) => l.category === 'wall-render')
    expect(renderLine!.quantity).toBeCloseTo(25 - 1.8, 5)
  })
})

/**
 * Second e2e file section: confirms every law-module BOQ line (foundation,
 * tie-columns, centuri, lintels, roof) is derived from real bim-engine
 * primitives and the seeded Material catalog rather than the flat area rates
 * that used to cover them. Uses a closed-rectangle house so tie-column /
 * centura auto-provisioning has real load-bearing walls to work with.
 */
describe('Cost engine BOQ — foundation / tie-columns / centuri / lintels / roof (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
  let houseId: string
  let entryWallId: string

  const perimeterM = 4 * 5 // closed 5m × 5m rectangle -> 20m perimeter

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    server = app.getHttpServer()

    const email = `cost-full-boq-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Cost Full BOQ Test')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cost Full BOQ Project' })
      .expect(201)
    const projectId = projectRes.body.data.id

    // Cluj -> STAS 6054-77 verified 900mm frost depth, and 0.10g P100-1/2013
    // ag (low-seismicity, so a small window does NOT trigger an S3 column —
    // only S1s on the 4 corners).
    await request(server)
      .patch(`/api/v1/projects/${projectId}/plot`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ county: 'Cluj' })
      .expect(200)

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    houseId = houseRes.body.data.id

    // Closed 5m × 5m rectangle -> 4 S1 corners, no S2 (each side < 4m
    // spacing rule), 4 centuri (one per wall on floor 0) + 4 top-floor
    // centuri (level 1, the "above topmost floor" case bim-engine always
    // generates). Perimeter = 20m.
    const w1 = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 5, endY: 0, floor: 0, thickness: 0.38, height: 2.7, isExterior: true })
      .expect(201)
    entryWallId = w1.body.data.id
    await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 5, startY: 0, endX: 5, endY: 5, floor: 0, thickness: 0.38, height: 2.7, isExterior: true })
      .expect(201)
    await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 5, startY: 5, endX: 0, endY: 5, floor: 0, thickness: 0.38, height: 2.7, isExterior: true })
      .expect(201)
    await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 5, endX: 0, endY: 0, floor: 0, thickness: 0.38, height: 2.7, isExterior: true })
      .expect(201)

    // One door + one window to exercise the lintel line.
    await request(server)
      .post(`/api/v1/houses/${houseId}/openings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ wallId: entryWallId, type: 'DOOR', position: 1, width: 0.9, height: 2.1, sillHeight: 0 })
      .expect(201)
    await request(server)
      .post(`/api/v1/houses/${houseId}/openings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ wallId: entryWallId, type: 'WINDOW', position: 3, width: 1.2, height: 1.2, sillHeight: 0.9 })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
  })

  it('replaces the flat structure/roof area-rates with real BOQ lines', async () => {
    const res = await request(server)
      .post(`/api/v1/costs/houses/${houseId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const breakdown: Array<{
      category: string
      name: string
      quantity: number
      unit: string
      unitPrice: number
      priceVerified?: boolean
      verified?: boolean
      notes?: string
    }> = res.body.data.breakdown

    // Flat categories now covered by real BOQ lines must be gone.
    expect(breakdown.some((l) => l.category === 'structure')).toBe(false)
    expect(breakdown.some((l) => l.category === 'roof')).toBe(false)
    expect(breakdown.some((l) => l.category === 'masonry')).toBe(false)

    // Foundation: lean + structural concrete, both from seeded materials.
    // Foundation width = 380mm wall + 2 × 150mm overhang = 680mm.
    // Perimeter = 20m -> lean concrete volume = 0.1 × 0.68 × 20 = 1.36 m³.
    // Structural concrete volume = 0.9 × 0.68 × 20 = 12.24 m³.
    const leanLine = breakdown.find((l) => l.category === 'foundation-lean')
    expect(leanLine).toBeDefined()
    expect(leanLine!.name).toBe('Beton de egalizare C8/10')
    expect(leanLine!.unit).toBe('m³')
    expect(leanLine!.quantity).toBeCloseTo(0.1 * 0.68 * perimeterM, 3)

    const structConcreteLine = breakdown.find((l) => l.category === 'foundation-structural')
    expect(structConcreteLine).toBeDefined()
    expect(structConcreteLine!.name).toBe('Beton C16/20')
    expect(structConcreteLine!.quantity).toBeCloseTo(0.9 * 0.68 * perimeterM, 3)

    // Foundation rebar: TRANSVERSE + LONGITUDINAL mats, both B500C.
    const transverseFoundation = breakdown.find((l) => l.category === 'foundation-rebar-transverse')
    expect(transverseFoundation).toBeDefined()
    expect(transverseFoundation!.name).toContain('Oțel beton B500C')
    expect(transverseFoundation!.name).toContain('Ø10')
    expect(transverseFoundation!.unit).toBe('kg')
    expect(transverseFoundation!.quantity).toBeGreaterThan(0)

    const longitudinalFoundation = breakdown.find((l) => l.category === 'foundation-rebar-longitudinal')
    expect(longitudinalFoundation).toBeDefined()
    expect(longitudinalFoundation!.name).toContain('Ø6')

    // Tie-columns: 4 S1 corners + 4 S2 midpoints (each 5m wall is at the
    // MAX_TIE_COLUMN_SPACING_M threshold and gets one intermediate column) =
    // 8 total. Each 250×250 × 2.7m = 0.16875 m³ of C12/15 -> 1.35 m³.
    const tieColumnConcrete = breakdown.find((l) => l.category === 'tie-column-concrete')
    expect(tieColumnConcrete).toBeDefined()
    expect(tieColumnConcrete!.name).toBe('Beton C12/15')
    expect(tieColumnConcrete!.quantity).toBeCloseTo(8 * 0.25 * 0.25 * 2.7, 3)

    const tieColumnLong = breakdown.find((l) => l.category === 'tie-column-rebar-longitudinal')
    expect(tieColumnLong).toBeDefined()
    expect(tieColumnLong!.name).toContain('Ø14') // CR6-2013 4×Ø14 default

    const tieColumnStirrup = breakdown.find((l) => l.category === 'tie-column-rebar-stirrup')
    expect(tieColumnStirrup).toBeDefined()
    expect(tieColumnStirrup!.name).toContain('Ø6')

    // Centuri: 8 centura rows (4 walls × 2 levels: floor 0 + above-top level).
    // Exterior wall centura: 260mm height × 380mm width × 5m wall length =
    // 0.494 m³ each. 8 × 0.494 = 3.952 m³.
    const centuraConcrete = breakdown.find((l) => l.category === 'centura-concrete')
    expect(centuraConcrete).toBeDefined()
    expect(centuraConcrete!.name).toBe('Beton C12/15')
    expect(centuraConcrete!.quantity).toBeCloseTo(8 * 0.26 * 0.38 * 5, 3)

    const centuraLong = breakdown.find((l) => l.category === 'centura-rebar-longitudinal')
    expect(centuraLong).toBeDefined()
    expect(centuraLong!.name).toContain('Ø10')

    const centuraStirrup = breakdown.find((l) => l.category === 'centura-rebar-stirrup')
    expect(centuraStirrup).toBeDefined()

    // Lintels: 2 openings, 2 prefabricated lintels @ 45 RON each.
    const lintelLine = breakdown.find((l) => l.category === 'lintel')
    expect(lintelLine).toBeDefined()
    expect(lintelLine!.name).toBe('Buiandrug prefabricat')
    expect(lintelLine!.quantity).toBe(2)
    expect(lintelLine!.unitPrice).toBe(45)

    // Roof: 5×5 footprint + 2×0.7m overhang → 6.4×6.4 flat area / cos(35°).
    const roofLine = breakdown.find((l) => l.category === 'roof-covering')
    expect(roofLine).toBeDefined()
    expect(roofLine!.name).toBe('Țiglă ceramică Tondach standard')
    expect(roofLine!.unit).toBe('m²')
    const expectedRoofArea = 6.4 * 6.4 / Math.cos((35 * Math.PI) / 180)
    expect(roofLine!.quantity).toBeCloseTo(expectedRoofArea, 1)
    // Overhang is convention-only (not a normativ figure) -> unverified,
    // surfaced via the `verified` + notes fields for the UI.
    expect(roofLine!.verified).toBe(false)
    expect(roofLine!.notes).toContain('unverified overhang')

    // Every real BOQ line reflects the seeded material's priceVerified: false.
    for (const line of [
      leanLine,
      structConcreteLine,
      tieColumnConcrete,
      centuraConcrete,
      lintelLine,
      roofLine,
      transverseFoundation,
    ]) {
      expect(line!.priceVerified).toBe(false)
    }

    // Total sanity: sum of every line's quantity × unitPrice = the returned total.
    const sum = breakdown.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    expect(res.body.data.total).toBeCloseTo(sum, 2)
    expect(res.body.data.total).toBeGreaterThan(0)
  })
})
