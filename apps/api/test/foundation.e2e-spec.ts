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

describe('Foundation law module — STAS 6054-77 / NP 112-2014 (e2e)', () => {
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

    const email = `foundation-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Foundation Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createHouseWithWall(county: string | null, wallThicknessM: number) {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Foundation Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    const projectId = projectRes.body.data.id

    if (county) {
      await request(server)
        .patch(`/api/v1/projects/${projectId}/plot`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ county })
        .expect(200)
    }

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    const houseId = houseRes.body.data.id

    await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        startX: 0,
        startY: 0,
        endX: 10,
        endY: 0,
        floor: 0,
        thickness: wallThicknessM,
        isExterior: true,
      })
      .expect(201)

    return houseId
  }

  it('auto-provisions a verified STAS 6054-77 depth for a cited locality (Brașov, 1000mm)', async () => {
    const houseId = await createHouseWithWall('Brașov', 0.38)

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/foundation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const foundation = res.body.data
    expect(foundation.depthMm).toBe(1000)
    expect(foundation.depthVerified).toBe(true)
    // 380mm Leier wall + 2*150mm overhang = 680mm.
    expect(foundation.widthMm).toBe(680)
    expect(foundation.concreteClass).toBe('C16/20')

    const layerNames = foundation.assemblyLayers.map((l: { material: { name: string } }) => l.material.name)
    expect(layerNames).toEqual(['Beton de egalizare C8/10', 'Beton C16/20'])

    const roles = foundation.reinforcementSpecs.map((r: { role: string }) => r.role).sort()
    expect(roles).toEqual(['LONGITUDINAL', 'TRANSVERSE'])
    const transverse = foundation.reinforcementSpecs.find((r: { role: string }) => r.role === 'TRANSVERSE')
    expect(transverse.barDiameterMm).toBe(10)
    expect(transverse.spacingMm).toBe(250)
    expect(transverse.coverMm).toBe(40)
    const distribution = foundation.reinforcementSpecs.find((r: { role: string }) => r.role === 'LONGITUDINAL')
    expect(distribution.barDiameterMm).toBe(6)
    expect(distribution.spacingMm).toBe(250)
  })

  it('falls back to the conservative unverified depth for an uncited locality', async () => {
    const houseId = await createHouseWithWall('Vaslui', 0.38)

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/foundation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res.body.data.depthMm).toBe(900)
    expect(res.body.data.depthVerified).toBe(false)
  })

  it('is idempotent — a second call returns the same provisioned row, not a duplicate', async () => {
    const houseId = await createHouseWithWall('Cluj', 0.38)

    const first = await request(server)
      .get(`/api/v1/houses/${houseId}/foundation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    const second = await request(server)
      .get(`/api/v1/houses/${houseId}/foundation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(second.body.data.id).toBe(first.body.data.id)
    expect(second.body.data.assemblyLayers).toHaveLength(2)
  })
})
