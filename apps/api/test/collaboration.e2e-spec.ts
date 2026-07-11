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

describe('Collaboration — ProjectMember invite / accept / remove (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let ownerToken: string
  let memberToken: string
  let memberEmail: string

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
    ownerToken = await registerAndVerify(server, `collab-owner-${ts}@example.com`, 'Owner')
    memberEmail = `collab-member-${ts}@example.com`
    memberToken = await registerAndVerify(server, memberEmail, 'Member')
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProject(token: string): Promise<string> {
    const res = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Collab Test ${Date.now()}-${Math.random()}` })
      .expect(201)
    return res.body.data.id
  }

  it('GET /projects/:id/members — starts empty (no members)', async () => {
    const projectId = await createProject(ownerToken)

    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })

  it('POST /projects/:id/members/invite — owner invites a user by email', async () => {
    const projectId = await createProject(ownerToken)

    const res = await request(server)
      .post(`/api/v1/projects/${projectId}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberEmail, role: 'EDITOR' })
      .expect(201)

    const member = res.body.data
    expect(member.role).toBe('EDITOR')
    expect(member.acceptedAt).toBeNull()
  })

  it('POST /projects/:id/members/accept — invited user accepts the invite', async () => {
    const projectId = await createProject(ownerToken)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberEmail, role: 'EDITOR' })
      .expect(201)

    const acceptRes = await request(server)
      .post(`/api/v1/projects/${projectId}/members/accept`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({})
      .expect(201)

    const accepted = acceptRes.body.data
    expect(accepted.acceptedAt).not.toBeNull()
    expect(accepted.role).toBe('EDITOR')
  })

  it('shared project appears in the invited user\'s findAll after acceptance', async () => {
    const projectId = await createProject(ownerToken)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberEmail, role: 'EDITOR' })
      .expect(201)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/accept`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({})
      .expect(201)

    const listRes = await request(server)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200)

    const ids = (listRes.body.data as { id: string }[]).map((p) => p.id)
    expect(ids).toContain(projectId)
  })

  it('DELETE /projects/:id/members/:userId — owner removes a member', async () => {
    const projectId = await createProject(ownerToken)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberEmail, role: 'EDITOR' })
      .expect(201)

    await request(server)
      .post(`/api/v1/projects/${projectId}/members/accept`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({})
      .expect(201)

    // Look up the member's user id via the members list.
    const membersRes = await request(server)
      .get(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    const targetMember = (membersRes.body.data as { userId: string }[]).find(
      (m) => m.userId !== undefined,
    )
    expect(targetMember).toBeDefined()
    const targetUserId = targetMember!.userId

    await request(server)
      .delete(`/api/v1/projects/${projectId}/members/${targetUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    const afterRes = await request(server)
      .get(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    expect(afterRes.body.data).toHaveLength(0)
  })
})
