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

describe('MEP module — I 9-2015 / NTE 007/08/00 + PE 155/92 (e2e)', () => {
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

    const email = `mep-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'MEP Test')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createHouseWithRooms(
    rooms: { type: string; name: string; area: number; floor?: number }[],
  ): Promise<string> {
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `MEP Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    const houseId: string = houseRes.body.data.id

    for (const room of rooms) {
      await request(server)
        .post(`/api/v1/houses/${houseId}/rooms`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: room.type,
          name: room.name,
          floor: room.floor ?? 0,
          area: room.area,
          width: Math.sqrt(room.area),
          height: 2.7,
        })
        .expect(201)
    }

    return houseId
  }

  it('auto-provisions BATHROOM water points (I 9-2015) on first GET /mep', async () => {
    const houseId = await createHouseWithRooms([
      { type: 'BATHROOM', name: 'Baie', area: 6 },
    ])

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const pts: { type: string; count: number; standard: string; notes?: string | null }[] = res.body.data

    // I 9-2015 bathroom: 2 WATER_SUPPLY, 2 HOT_WATER_SUPPLY, 2 DRAIN
    const ws = pts.find((p) => p.type === 'WATER_SUPPLY')
    const hw = pts.find((p) => p.type === 'HOT_WATER_SUPPLY')
    const dr = pts.find((p) => p.type === 'DRAIN')

    expect(ws).toBeDefined()
    expect(ws!.count).toBe(2)
    expect(ws!.standard).toContain('I 9-2015')

    expect(hw).toBeDefined()
    expect(hw!.count).toBe(2)

    expect(dr).toBeDefined()
    expect(dr!.count).toBe(2)

    // NTE 007/08/00: 1 IP44 outlet for bathroom
    const outlet = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlet).toBeDefined()
    expect(outlet!.count).toBe(1)
    expect(outlet!.notes).toContain('IP44')
    expect(outlet!.standard).toContain('NTE 007')
  })

  it('getMepPoints is idempotent — two calls return same data, no duplicate rows', async () => {
    const houseId = await createHouseWithRooms([
      { type: 'BATHROOM', name: 'Baie', area: 6 },
    ])

    const res1 = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const res2 = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res1.body.data.length).toBe(res2.body.data.length)

    const ids1: string[] = res1.body.data.map((p: { id: string }) => p.id).sort()
    const ids2: string[] = res2.body.data.map((p: { id: string }) => p.id).sort()
    expect(ids1).toEqual(ids2)
  })

  it('returns correct water + electrical points for KITCHEN (I 9-2015 / PE 155/92)', async () => {
    const houseId = await createHouseWithRooms([
      { type: 'KITCHEN', name: 'Bucătărie', area: 12 },
    ])

    const res = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const pts: { type: string; count: number; standard: string }[] = res.body.data

    // I 9-2015 kitchen: 2 cold (sink + washing machine pre-provision), 1 hot, 1 drain
    const ws = pts.find((p) => p.type === 'WATER_SUPPLY')
    const hw = pts.find((p) => p.type === 'HOT_WATER_SUPPLY')
    const dr = pts.find((p) => p.type === 'DRAIN')
    expect(ws?.count).toBe(2)
    expect(hw?.count).toBe(1)
    expect(dr?.count).toBe(1)

    // PE 155/92 §5.2: 4 electrical outlets for kitchen
    const outlet = pts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(outlet?.count).toBe(4)
  })

  it('regenerates MEP points after room type change — old points replaced', async () => {
    const houseId = await createHouseWithRooms([
      { type: 'BEDROOM', name: 'Dormitor', area: 15 },
    ])

    // First auto-provision — bedroom has no water points, 3 outlets
    const before = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const beforePts: { type: string; count: number }[] = before.body.data
    expect(beforePts.find((p) => p.type === 'WATER_SUPPLY')).toBeUndefined()
    const beforeOutlet = beforePts.find((p) => p.type === 'ELECTRICAL_OUTLET')
    expect(beforeOutlet?.count).toBe(3)

    // Change the room type to KITCHEN by updating its type field directly via Prisma
    // (simulates what would happen after the user changes room type in the editor)
    const rooms = await prisma.room.findMany({ where: { houseId } })
    await prisma.room.update({ where: { id: rooms[0].id }, data: { type: 'KITCHEN' } })

    // Regenerate
    await request(server)
      .post(`/api/v1/houses/${houseId}/mep/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const after = await request(server)
      .get(`/api/v1/houses/${houseId}/mep`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const afterPts: { type: string; count: number }[] = after.body.data
    // Kitchen: 2 cold water, 1 hot, 1 drain, 4 outlets
    expect(afterPts.find((p) => p.type === 'WATER_SUPPLY')?.count).toBe(2)
    expect(afterPts.find((p) => p.type === 'HOT_WATER_SUPPLY')?.count).toBe(1)
    expect(afterPts.find((p) => p.type === 'DRAIN')?.count).toBe(1)
    expect(afterPts.find((p) => p.type === 'ELECTRICAL_OUTLET')?.count).toBe(4)
  })
})
