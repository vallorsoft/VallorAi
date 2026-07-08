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

describe('Centură (ring beam) law module — CR6-2013 (e2e)', () => {
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

    const email = `centura-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Centura Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProjectAndHouse(floors = 1) {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Centura Test ${Date.now()}-${Math.random()}` })
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
    floor: number,
    isExterior: boolean,
    thickness = 0.38,
    isLoad = false,
  ) {
    const res = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX, startY, endX, endY, floor, thickness, isExterior, isLoad })
      .expect(201)
    return res.body.data.id as string
  }

  it('places a centură per load-bearing wall plus an extra above-top-floor level, with CR6-2013 reinforcement', async () => {
    const houseId = await createProjectAndHouse(1)
    await addWall(houseId, 0, 0, 5, 0, 0, true, 0.38)
    await addWall(houseId, 0, 0, 0, 4, 0, false, 0.25, true) // load-bearing interior wall

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/centuri`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const centuri = res.body.data
    // 2 walls x (own level 0 + above-top-floor level 1) = 4 rows.
    expect(centuri).toHaveLength(4)
    expect(centuri.every((c: { concreteClass: string }) => c.concreteClass === 'C12/15')).toBe(true)

    const exterior = centuri.find((c: { widthMm: number }) => c.widthMm === 380)
    const interior = centuri.find((c: { widthMm: number }) => c.widthMm === 250)
    // Exterior centură height = 2x slab thickness; interior = 1x.
    expect(exterior.heightMm).toBe(interior.heightMm * 2)
    expect(exterior.heightMm).toBe(260)
    expect(interior.heightMm).toBe(130)

    const specs = exterior.reinforcementSpecs
    const longitudinal = specs.find((s: { role: string }) => s.role === 'LONGITUDINAL')
    expect(longitudinal.barCount).toBeGreaterThanOrEqual(4)
    expect(longitudinal.barDiameterMm).toBe(10)
    const stirrup = specs.find((s: { role: string }) => s.role === 'STIRRUP')
    expect(stirrup.barDiameterMm).toBe(6)
    expect(stirrup.spacingMm).toBe(150)

    const levels = centuri.map((c: { level: number }) => c.level).sort()
    expect(levels).toEqual([0, 0, 1, 1])
  })

  it('gives a wall on an upper floor two levels (its own + above-top-floor), a ground-floor wall only its own', async () => {
    const houseId = await createProjectAndHouse(2)
    await addWall(houseId, 0, 0, 5, 0, 0, true, 0.38)
    await addWall(houseId, 0, 0, 5, 0, 1, true, 0.38)

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/centuri`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const levels = res.body.data.map((c: { level: number }) => c.level).sort()
    expect(levels).toEqual([0, 1, 2])
  })

  it('is idempotent — a second call does not duplicate the placements', async () => {
    const houseId = await createProjectAndHouse(1)
    await addWall(houseId, 0, 0, 5, 0, 0, true, 0.38)

    const first = await request(server)
      .get(`/api/v1/houses/${houseId}/centuri`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    const second = await request(server)
      .get(`/api/v1/houses/${houseId}/centuri`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(second.body.data).toHaveLength(first.body.data.length)
  })
})
