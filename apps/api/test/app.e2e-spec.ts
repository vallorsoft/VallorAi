import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { prisma } from '@ai-home-designer/database'
import { AppModule } from '../src/app.module'
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter'

describe('AppModule (e2e)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects unauthenticated requests to a protected route', async () => {
    await request(app.getHttpServer()).get('/api/v1/projects').expect(401)
  })

  it('registers a user unverified, then issues tokens once the email is verified', async () => {
    const email = `smoke-${Date.now()}@example.com`

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Sup3rSecret!', name: 'Smoke Test' })
      .expect(201)

    expect(registerRes.body.success).toBe(true)
    expect(registerRes.body.data).toEqual({ message: expect.any(String) })

    // Login before verifying must be rejected.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(403)

    // No email inbox in tests — read the verification token straight from the DB,
    // the same way a user would get it from the email link.
    const user = await prisma.user.findUnique({ where: { email } })
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: user?.verificationToken })
      .expect(200)

    expect(verifyRes.body.data).toHaveProperty('accessToken')
    expect(verifyRes.body.data).toHaveProperty('refreshToken')

    // Login now succeeds.
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(200)
    expect(loginRes.body.data).toHaveProperty('accessToken')
  })

  it('returns a normalized validation error for an invalid registration payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Sup3rSecret!', name: 'Smoke Test' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toHaveProperty('code', 'VALIDATION_FAILED')
    expect(response.body.error).toHaveProperty('message')
  })
})
