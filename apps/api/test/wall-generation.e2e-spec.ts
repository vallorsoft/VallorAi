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

/** An assistant message whose metadata carries an unapplied ADD_ROOM design_update. */
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

describe('Generated walls from AI rooms (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    server = app.getHttpServer()

    const email = `wall-gen-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Wall Gen Test')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Wall Gen Project' })
      .expect(201)
    projectId = projectRes.body.data.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('rebuild applies AI rooms AND derives generated walls per floor', async () => {
    // Two ground-floor rooms + one upstairs — the conversation shape the AI
    // actually produces (rooms only, never walls).
    await assistantAddRoomMessage(projectId, 'parter', 'living_room', 24)
    await assistantAddRoomMessage(projectId, 'parter', 'kitchen', 12)
    await assistantAddRoomMessage(projectId, 'etaj', 'bedroom', 16)

    const rebuildRes = await request(server)
      .post(`/api/v1/ai/projects/${projectId}/rebuild`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
    expect(rebuildRes.body.data.appliedCount).toBe(3)

    const houseRes = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    const house = houseRes.body.data

    expect(house.rooms).toHaveLength(3)
    // Upstairs rooms are no longer shoved into a separate flat-view row.
    const upstairs = house.rooms.find((r: { floor: number }) => r.floor === 1)
    expect(upstairs.posY).toBe(0)

    const walls: Array<{ floor: number; isExterior: boolean; isGenerated: boolean }> = house.walls
    expect(walls.length).toBeGreaterThan(0)
    expect(walls.every((w) => w.isGenerated)).toBe(true)

    // Ground floor: two adjacent rooms -> exactly one shared interior wall.
    const groundInterior = walls.filter((w) => w.floor === 0 && !w.isExterior)
    expect(groundInterior).toHaveLength(1)
    // Upstairs: a single room -> its 4 exterior walls, no interior ones.
    const upperWalls = walls.filter((w) => w.floor === 1)
    expect(upperWalls).toHaveLength(4)
    expect(upperWalls.every((w) => w.isExterior)).toBe(true)
  })

  it('re-derives generated walls when a room is deleted, and never touches manual walls', async () => {
    const house = await prisma.house.findUniqueOrThrow({ where: { projectId } })

    // A user-drawn wall must survive every regeneration untouched.
    const manualRes = await request(server)
      .post(`/api/v1/houses/${house.id}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: -3, endX: 4, endY: -3, floor: 0, isExterior: true })
      .expect(201)
    const manualWallId = manualRes.body.data.id

    const kitchen = await prisma.room.findFirstOrThrow({
      where: { houseId: house.id, type: 'kitchen' },
    })
    await request(server)
      .delete(`/api/v1/houses/rooms/${kitchen.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const walls = await prisma.wall.findMany({ where: { houseId: house.id } })
    // Only the living room remains on the ground floor -> no interior wall anywhere.
    expect(walls.filter((w) => w.isGenerated && !w.isExterior)).toHaveLength(0)
    expect(walls.filter((w) => w.isGenerated && w.floor === 0)).toHaveLength(4)
    expect(walls.find((w) => w.id === manualWallId)).toBeDefined()
  })
})
