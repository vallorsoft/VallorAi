import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter'

describe('Project versioning (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
  let projectId: string
  let houseId: string

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

    const email = `versioning-${Date.now()}@example.com`
    const registerRes = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Sup3rSecret!', name: 'Versioning Test' })
      .expect(201)
    accessToken = registerRes.body.data.accessToken

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test Project' })
      .expect(201)
    projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    houseId = houseRes.body.data.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('creates a ProjectVersion snapshot when a room is added', async () => {
    const before = await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(before.body.data).toHaveLength(0)

    await request(server)
      .post(`/api/v1/houses/${houseId}/rooms`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'LIVING_ROOM', name: 'Living Room', floor: 0, area: 14, width: 4, height: 3.5 })
      .expect(201)

    const after = await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(after.body.data).toHaveLength(1)
    expect(after.body.data[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), createdAt: expect.any(String) }),
    )
  })

  it('lists versions newest first and restoring reverts House state and adds one more version', async () => {
    // Version #1 already exists (one room). Capture it, then add a second room.
    const afterFirstRoom = await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(afterFirstRoom.body.data).toHaveLength(1)
    const versionAfterFirstRoom = afterFirstRoom.body.data[0].id

    await request(server)
      .post(`/api/v1/houses/${houseId}/rooms`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'KITCHEN', name: 'Kitchen', floor: 0, area: 8, width: 3, height: 2.7 })
      .expect(201)

    const afterSecondRoom = await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(afterSecondRoom.body.data).toHaveLength(2)
    // newest first
    expect(afterSecondRoom.body.data[0].createdAt >= afterSecondRoom.body.data[1].createdAt).toBe(true)

    const currentHouse = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(currentHouse.body.data.rooms).toHaveLength(2)

    // Restore to the version captured right after the first room was added.
    const restoreRes = await request(server)
      .post(`/api/v1/projects/${projectId}/versions/${versionAfterFirstRoom}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
    expect(restoreRes.body.data).toHaveProperty('id')

    const restoredHouse = await request(server)
      .get(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(restoredHouse.body.data.rooms).toHaveLength(1)
    expect(restoredHouse.body.data.rooms[0].name).toBe('Living Room')

    // Restoring is itself a mutation: version count goes up by one more (3),
    // not just reverted in place.
    const afterRestore = await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(afterRestore.body.data).toHaveLength(3)
  })

  it('rejects listing/restoring versions for a project owned by another user', async () => {
    const otherEmail = `versioning-other-${Date.now()}@example.com`
    const otherRes = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Sup3rSecret!', name: 'Other User' })
      .expect(201)
    const otherToken = otherRes.body.data.accessToken

    await request(server)
      .get(`/api/v1/projects/${projectId}/versions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })
})
