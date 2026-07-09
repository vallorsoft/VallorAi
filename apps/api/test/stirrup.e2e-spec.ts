import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import {
  generateCenturaStirrupInstances,
  generateTieColumnStirrupInstances,
} from '@ai-home-designer/bim-engine'
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

/**
 * Step 9 (kengyer/stirrup rebar) e2e: the stirrup ReinforcementSpec rows
 * live on the same tie-column / centură rows the CR6-2013 modules already
 * ship (module 2 + 3). This test confirms the STIRRUP-role specs surface
 * through the existing endpoints and drive the bim-engine stirrup-
 * instancing to produce the 4-segments-per-loop instance matrices the 3D
 * viewer's StirrupInstances mesh consumes.
 */
describe('Stirrup / kengyer rebar (step 9) — end-to-end via tie-column & centură endpoints', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string

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

    const email = `stirrup-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Stirrup Step 9 Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProjectAndHouse(floors = 1) {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Stirrup Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors, roofType: 'GABLED' })
      .expect(201)
    return houseRes.body.data.id as string
  }

  async function addWall(
    houseId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    floor = 0,
    thickness = 0.38,
    isExterior = true,
  ) {
    const res = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX, startY, endX, endY, floor, thickness, isExterior })
      .expect(201)
    return res.body.data.id as string
  }

  it('every S1 tie-column carries a CR6-2013 STIRRUP spec that produces 4 segments per loop', async () => {
    const houseId = await createProjectAndHouse()
    // Closed rectangle -> 4 S1 corners, all under 4m so no S2.
    await addWall(houseId, 0, 0, 3.5, 0)
    await addWall(houseId, 3.5, 0, 3.5, 3)
    await addWall(houseId, 3.5, 3, 0, 3)
    await addWall(houseId, 0, 3, 0, 0)

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/tie-columns`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const columns = res.body.data
    expect(columns).toHaveLength(4)
    for (const column of columns) {
      const stirrup = column.reinforcementSpecs.find((s: { role: string }) => s.role === 'STIRRUP')
      expect(stirrup).toBeDefined()
      expect(stirrup.barDiameterMm).toBe(6)
      expect(stirrup.spacingMm).toBe(150)
      expect(stirrup.coverMm).toBe(25)

      // Feed the spec into the bim-engine composer: same LEVEL_HEIGHT_M
      // (2.7m) the 3D viewer uses. Expect 18 loops × 4 segments = 72
      // instance matrices for the constructive-minimum default.
      const { count, matrices } = generateTieColumnStirrupInstances(
        {
          posXMm: column.posX * 1000,
          posZMm: column.posY * 1000,
          baseYMm: 0,
          lengthMm: 2700,
          crossSectionAMm: column.crossSectionMm,
          crossSectionBMm: column.crossSectionMm,
        },
        {
          diameterMm: stirrup.barDiameterMm,
          spacingMm: stirrup.spacingMm,
          coverMm: stirrup.coverMm,
          role: 'STIRRUP',
        },
      )
      expect(count).toBe(72)
      expect(matrices).toHaveLength(72 * 16)
    }
  })

  it('every centură carries a STIRRUP spec that drives a horizontal loop layout', async () => {
    const houseId = await createProjectAndHouse()
    await addWall(houseId, 0, 0, 5, 0, 0, 0.38, true)

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/centuri`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const centuri = res.body.data
    expect(centuri.length).toBeGreaterThan(0)
    const centura = centuri[0]
    const stirrup = centura.reinforcementSpecs.find((s: { role: string }) => s.role === 'STIRRUP')
    expect(stirrup).toBeDefined()

    const { count } = generateCenturaStirrupInstances(
      {
        startXMm: 0,
        startZMm: 0,
        endXMm: 5000,
        endZMm: 0,
        baseYMm: 0,
        heightMm: centura.heightMm,
        thicknessMm: centura.widthMm,
        crossSectionHeightMm: centura.heightMm,
      },
      {
        diameterMm: stirrup.barDiameterMm,
        spacingMm: stirrup.spacingMm,
        coverMm: stirrup.coverMm,
        role: 'STIRRUP',
      },
    )
    // 5m centura, 25mm cover, 150mm spacing → 34 loops × 4 segments.
    expect(count).toBe(34 * 4)
  })
})
