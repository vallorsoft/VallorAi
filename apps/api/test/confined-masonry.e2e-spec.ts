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

describe('Confined masonry law module — CR6-2013 stâlpișori + buiandrug (e2e)', () => {
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

    const email = `confined-masonry-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Confined Masonry Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProjectAndHouse() {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Confined Masonry Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    return houseRes.body.data.id as string
  }

  async function addWall(
    houseId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    thickness = 0.38,
  ) {
    const res = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX, startY, endX, endY, floor: 0, thickness, isExterior: true })
      .expect(201)
    return res.body.data.id as string
  }

  describe('GET /houses/:id/tie-columns', () => {
    it('places S1 tie-columns at all 4 corners of a closed rectangle, with CR6-2013 reinforcement', async () => {
      const houseId = await createProjectAndHouse()
      // Every side stays under the 4m S2 threshold, so only S1 corners appear.
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
      expect(columns.every((c: { category: string }) => c.category === 'S1')).toBe(true)
      expect(columns.every((c: { crossSectionMm: number }) => c.crossSectionMm === 250)).toBe(true)
      expect(columns.every((c: { concreteClass: string }) => c.concreteClass === 'C12/15')).toBe(true)

      const specs = columns[0].reinforcementSpecs
      const longitudinal = specs.find((s: { role: string }) => s.role === 'LONGITUDINAL')
      expect(longitudinal.barCount).toBe(4)
      expect(longitudinal.barDiameterMm).toBe(14)
      expect(longitudinal.coverMm).toBe(25)
      const stirrup = specs.find((s: { role: string }) => s.role === 'STIRRUP')
      expect(stirrup.barDiameterMm).toBe(6)
      expect(stirrup.spacingMm).toBe(150)
    })

    it('adds S2 intermediate columns for a wall run longer than the max spacing', async () => {
      const houseId = await createProjectAndHouse()
      // A 9m wall alone (no other walls) -> ceil(9/4)=3 segments -> 2
      // evenly-spaced S2 midpoints, no S1 (no corners with only one wall).
      await addWall(houseId, 0, 0, 9, 0)

      const res = await request(server)
        .get(`/api/v1/houses/${houseId}/tie-columns`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      const columns = res.body.data
      expect(columns).toHaveLength(2)
      expect(columns.every((c: { category: string }) => c.category === 'S2')).toBe(true)
      const xs = columns.map((c: { posX: number }) => c.posX).sort((a: number, b: number) => a - b)
      expect(xs).toEqual([3, 6])
    })

    it('places no tie-column beside a plain door/window opening', async () => {
      const houseId = await createProjectAndHouse()
      const wallId = await addWall(houseId, 0, 0, 3, 0) // short wall, no S2 either

      await request(server)
        .post(`/api/v1/houses/${houseId}/openings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ wallId, type: 'WINDOW', position: 1, width: 1.2, height: 1.2, sillHeight: 0.9 })
        .expect(201)

      const res = await request(server)
        .get(`/api/v1/houses/${houseId}/tie-columns`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      // A lone 3m wall with one window: no corners (only one wall), under
      // the S2 spacing threshold, and this module never places a column
      // just because of an opening (that's the corrected behavior).
      expect(res.body.data).toHaveLength(0)
    })

    it('is idempotent — a second call does not duplicate the placements', async () => {
      const houseId = await createProjectAndHouse()
      await addWall(houseId, 0, 0, 6, 0)
      await addWall(houseId, 6, 0, 6, 4)
      await addWall(houseId, 6, 4, 0, 4)
      await addWall(houseId, 0, 4, 0, 0)

      const first = await request(server)
        .get(`/api/v1/houses/${houseId}/tie-columns`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
      const second = await request(server)
        .get(`/api/v1/houses/${houseId}/tie-columns`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(second.body.data).toHaveLength(first.body.data.length)
    })
  })

  describe('GET /houses/openings/:id/lintel', () => {
    it('auto-provisions a prefabricated lintel spanning the opening plus bearing on each side', async () => {
      const houseId = await createProjectAndHouse()
      const wallId = await addWall(houseId, 0, 0, 5, 0, 0.38)

      const openingRes = await request(server)
        .post(`/api/v1/houses/${houseId}/openings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ wallId, type: 'DOOR', position: 2, width: 0.9, height: 2.1, sillHeight: 0 })
        .expect(201)
      const openingId = openingRes.body.data.id

      const res = await request(server)
        .get(`/api/v1/houses/openings/${openingId}/lintel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      const lintel = res.body.data
      // 900mm door + 2*250mm bearing = 1400mm.
      expect(lintel.lengthMm).toBe(1400)
      expect(lintel.widthMm).toBe(380)
      expect(lintel.bearingLengthMm).toBe(250)
      expect(lintel.prefabricated).toBe(true)
      expect(lintel.material.name).toBe('Buiandrug prefabricat')
    })

    it('is idempotent — a second call returns the same row', async () => {
      const houseId = await createProjectAndHouse()
      const wallId = await addWall(houseId, 0, 0, 5, 0, 0.38)
      const openingRes = await request(server)
        .post(`/api/v1/houses/${houseId}/openings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ wallId, type: 'WINDOW', position: 2, width: 1.5, height: 1.2, sillHeight: 0.9 })
        .expect(201)
      const openingId = openingRes.body.data.id

      const first = await request(server)
        .get(`/api/v1/houses/openings/${openingId}/lintel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
      const second = await request(server)
        .get(`/api/v1/houses/openings/${openingId}/lintel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(second.body.data.id).toBe(first.body.data.id)
    })
  })
})
