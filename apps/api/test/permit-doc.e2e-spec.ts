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

describe('DTAC permit document PDF export (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
  let otherToken: string
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

    const email = `permit-doc-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Permit Doc Test')

    const otherEmail = `permit-doc-other-${Date.now()}@example.com`
    otherToken = await registerAndVerify(server, otherEmail, 'Permit Other')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Permit Doc Project' })
      .expect(201)
    projectId = projectRes.body.data.id
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns a valid PDF for a project with rooms', async () => {
    // Seed a house with rooms via the AI rebuild path
    const house = await prisma.house.create({
      data: { projectId, floors: 1, totalArea: 50 },
    })
    await prisma.room.createMany({
      data: [
        {
          houseId: house.id,
          type: 'LIVING_ROOM',
          name: 'Living',
          floor: 0,
          area: 22,
          width: 4.7,
          height: 2.7,
          posX: 0,
          posY: 0,
        },
        {
          houseId: house.id,
          type: 'BEDROOM',
          name: 'Dormitor',
          floor: 0,
          area: 14,
          width: 3.7,
          height: 2.7,
          posX: 5,
          posY: 0,
        },
        {
          houseId: house.id,
          type: 'BATHROOM',
          name: 'Baie',
          floor: 0,
          area: 6,
          width: 2.4,
          height: 2.7,
          posX: 9,
          posY: 0,
        },
      ],
    })

    const res = await request(server)
      .get(`/api/v1/exports/projects/${projectId}/permit-doc`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('dtac-rezumat.pdf')
    // PDF magic bytes: %PDF
    const body = Buffer.from(res.body as Buffer)
    expect(body.length).toBeGreaterThan(100)
    expect(body.slice(0, 4).toString()).toBe('%PDF')
  })

  it('returns a valid PDF for a project with no house data yet', async () => {
    // Create a second project with no house
    const emptyProjectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Empty Permit Project' })
      .expect(201)
    const emptyProjectId = emptyProjectRes.body.data.id

    const res = await request(server)
      .get(`/api/v1/exports/projects/${emptyProjectId}/permit-doc`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res.headers['content-type']).toContain('application/pdf')
    const body = Buffer.from(res.body as Buffer)
    expect(body.length).toBeGreaterThan(100)
    expect(body.slice(0, 4).toString()).toBe('%PDF')
  })

  it('returns 403 when a different user tries to access the permit doc', async () => {
    await request(server)
      .get(`/api/v1/exports/projects/${projectId}/permit-doc`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })
})
