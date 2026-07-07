import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
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

  it('registers a user and returns tokens', async () => {
    const email = `smoke-${Date.now()}@example.com`

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Sup3rSecret!', name: 'Smoke Test' })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveProperty('accessToken')
    expect(response.body.data).toHaveProperty('refreshToken')
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
