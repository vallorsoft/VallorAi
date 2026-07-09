import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { prisma, Prisma } from '@ai-home-designer/database'
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

function assistantAddRoomMessage(
  projectId: string,
  floor: string,
  roomType: string,
  areaSqm: number,
) {
  return prisma.message.create({
    data: {
      projectId,
      role: 'assistant',
      content: '{}',
      metadata: {
        message: 'placeholder',
        design_update: {
          action: 'ADD_ROOM',
          data: { floor, room_type: roomType, suggested_area_sqm: areaSqm },
        },
      } as unknown as Prisma.InputJsonValue,
    },
  })
}

describe('Floor-plan solver + openings + roof (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
  let projectId: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    server = app.getHttpServer()

    const email = `floor-plan-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'FP Test')
    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'FP Project' })
      .expect(201)
    projectId = projectRes.body.data.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('a 4-room conversation solves to a coherent footprint with doors and an entry door', async () => {
    await assistantAddRoomMessage(projectId, 'parter', 'living_room', 22)
    await assistantAddRoomMessage(projectId, 'parter', 'kitchen', 10)
    await assistantAddRoomMessage(projectId, 'parter', 'bedroom', 14)
    await assistantAddRoomMessage(projectId, 'parter', 'bathroom', 6)

    const rebuildRes = await request(server)
      .post(`/api/v1/ai/projects/${projectId}/rebuild`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
    expect(rebuildRes.body.data.appliedCount).toBe(4)

    const houseRes = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    const house = houseRes.body.data
    const rooms: Array<{ type: string; posX: number; posY: number; area: number; width: number }> = house.rooms
    const openings: Array<{ type: string; wallId: string; width: number }> = house.openings ?? []
    const walls: Array<{ id: string; isExterior: boolean; isGenerated: boolean }> = house.walls

    // The strip layout is gone: rooms occupy multiple Y bands, not a single row.
    const distinctY = new Set(rooms.map((r) => Math.round(r.posY * 10) / 10))
    expect(distinctY.size).toBeGreaterThan(1)

    // At least one interior door (between adjacent rooms) and exactly one entry door.
    expect(openings.some((o) => o.type === 'DOOR')).toBe(true)
    expect(openings.filter((o) => o.type === 'ENTRY_DOOR')).toHaveLength(1)
    // Windows on exterior walls.
    expect(openings.some((o) => o.type === 'WINDOW')).toBe(true)
    // Every opening sits on a generated wall (the ones we own).
    for (const o of openings) {
      const wall = walls.find((w) => w.id === o.wallId)
      expect(wall?.isGenerated).toBe(true)
    }
  })

  it('roof endpoint auto-provisions a real gable spec from the footprint', async () => {
    const house = await prisma.house.findUniqueOrThrow({ where: { projectId } })
    const roofRes = await request(server)
      .get(`/api/v1/houses/${house.id}/roof`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    const roof = roofRes.body.data
    expect(roof.type).toBe('GABLED')
    expect(roof.pitchDeg).toBe(35)
    expect(roof.overhangM).toBeCloseTo(0.7, 2)
    expect(roof.ridgeHeightM).toBeGreaterThan(0)
    expect(roof.pitchVerified).toBe(true)
    expect(roof.overhangVerified).toBe(false)
    expect(roof.material.name).toBe('Țiglă ceramică Tondach standard')
  })

  it('is idempotent — a rebuild without new rooms produces identical house state', async () => {
    const before = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    await request(server)
      .post(`/api/v1/ai/projects/${projectId}/rebuild`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
    const after = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    // Room positions/dimensions are byte-for-byte stable across rebuilds.
    const stripIds = (r: { posX: number; posY: number; width: number; area: number }[]) =>
      r.map((x) => ({ posX: x.posX, posY: x.posY, width: x.width, area: x.area }))
    expect(stripIds(after.body.data.rooms)).toEqual(stripIds(before.body.data.rooms))
    expect(after.body.data.walls.length).toBe(before.body.data.walls.length)
    expect((after.body.data.openings ?? []).length).toBe((before.body.data.openings ?? []).length)
  })
})
