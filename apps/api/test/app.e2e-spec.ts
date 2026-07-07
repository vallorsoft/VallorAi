import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import request from 'supertest'
import { AppModule } from '../src/app.module'

describe('AppModule (e2e)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1')
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

    expect(response.body).toHaveProperty('accessToken')
    expect(response.body).toHaveProperty('refreshToken')
  })
})
