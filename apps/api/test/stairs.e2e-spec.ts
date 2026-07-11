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

describe('Staircase module — NP 057-2002 / STAS 2965-86 (e2e)', () => {
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

    const email = `stairs-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Stairs Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createHouse(): Promise<string> {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Stairs Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 2, roofType: 'GABLED' })
      .expect(201)
    return houseRes.body.data.id
  }

  it('starts empty — no staircases auto-provisioned (single API call)', async () => {
    const houseId = await createHouse()

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })

  it('creates a staircase with deriveStaircaseSpec geometry for a 3000mm floor', async () => {
    const houseId = await createHouse()

    const res = await request(server)
      .post(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floor: 0, floorHeightMm: 3000 })
      .expect(201)

    const s = res.body.data
    // ceil(3000/200) = 15 risers, riser = 200mm, tread = 630-400 = 230mm
    expect(s.riserCount).toBe(15)
    expect(s.riserHeightMm).toBeCloseTo(200, 2)
    expect(s.treadDepthMm).toBeCloseTo(230, 2)
    // widthM defaults to MIN_CLEAR_WIDTH_MM/1000 = 0.9
    expect(s.widthM).toBeCloseTo(0.9, 3)
    // lengthM = (riserCount * treadDepth) / 1000
    expect(s.lengthM).toBeCloseTo((15 * 230) / 1000, 3)
    expect(s.handedness).toBe('RIGHT')
    expect(s.floor).toBe(0)
  })

  it('creates a staircase with a custom width (> 900mm default)', async () => {
    const houseId = await createHouse()

    const res = await request(server)
      .post(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floor: 0, floorHeightMm: 2700, widthMm: 1200 })
      .expect(201)

    const s = res.body.data
    expect(s.widthM).toBeCloseTo(1.2, 3)
  })

  it('can delete a staircase — list is empty afterwards', async () => {
    const houseId = await createHouse()

    const createRes = await request(server)
      .post(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floor: 0, floorHeightMm: 2700 })
      .expect(201)
    const staircaseId: string = createRes.body.data.id

    await request(server)
      .delete(`/api/v1/houses/${houseId}/staircases/${staircaseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const listRes = await request(server)
      .get(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(listRes.body.data).toHaveLength(0)
  })

  it('allows multiple staircases on different floors', async () => {
    const houseId = await createHouse()

    await request(server)
      .post(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floor: 0, floorHeightMm: 2700 })
      .expect(201)

    await request(server)
      .post(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floor: 1, floorHeightMm: 2700 })
      .expect(201)

    const listRes = await request(server)
      .get(`/api/v1/houses/${houseId}/staircases`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(listRes.body.data).toHaveLength(2)
    const floors = (listRes.body.data as { floor: number }[]).map((s) => s.floor).sort()
    expect(floors).toEqual([0, 1])
  })
})
