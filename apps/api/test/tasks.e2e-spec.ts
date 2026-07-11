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

describe('Project Tasks (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let ownerToken: string
  let viewerToken: string
  let viewerEmail: string

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

    const ts = Date.now()
    ownerToken = await registerAndVerify(server, `tasks-owner-${ts}@example.com`, 'Owner')
    viewerEmail = `tasks-viewer-${ts}@example.com`
    viewerToken = await registerAndVerify(server, viewerEmail, 'Viewer')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProject(token: string): Promise<string> {
    const res = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Task Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    return res.body.data.id
  }

  it('GET /projects/:id/tasks — returns empty array initially', async () => {
    const projectId = await createProject(ownerToken)

    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })

  it('POST /projects/:id/tasks — owner creates a task, fields are returned correctly', async () => {
    const projectId = await createProject(ownerToken)

    const res = await request(server)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Test task', priority: 'HIGH' })
      .expect(201)

    const task = res.body.data
    expect(task.title).toBe('Test task')
    expect(task.status).toBe('TODO')
    expect(task.priority).toBe('HIGH')
    expect(task.completedAt).toBeNull()
  })

  it('PATCH /projects/:id/tasks/:taskId — status → DONE sets completedAt', async () => {
    const projectId = await createProject(ownerToken)

    const createRes = await request(server)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Completable task', priority: 'MEDIUM' })
      .expect(201)

    const taskId = createRes.body.data.id

    const patchRes = await request(server)
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'DONE' })
      .expect(200)

    expect(patchRes.body.data.status).toBe('DONE')
    expect(patchRes.body.data.completedAt).not.toBeNull()
  })

  it('DELETE /projects/:id/tasks/:taskId — task is deleted, list becomes empty', async () => {
    const projectId = await createProject(ownerToken)

    const createRes = await request(server)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'To be deleted' })
      .expect(201)

    const taskId = createRes.body.data.id

    await request(server)
      .delete(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    const listRes = await request(server)
      .get(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    expect(listRes.body.data).toHaveLength(0)
  })

  it('POST /projects/:id/tasks — VIEWER cannot create a task (403)', async () => {
    const projectId = await createProject(ownerToken)

    // Invite the viewer and have them accept
    await request(server)
      .post(`/api/v1/projects/${projectId}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'VIEWER' })
      .expect(201)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/accept`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({})
      .expect(201)

    await request(server)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'Should be blocked' })
      .expect(403)
  })
})
