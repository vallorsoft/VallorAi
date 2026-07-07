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

describe('Wall assembly layers (e2e)', () => {
  let app: NestFastifyApplication
  let server: ReturnType<NestFastifyApplication['getHttpServer']>
  let accessToken: string
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

    const email = `wall-assembly-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Wall Assembly Test')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Assembly Test Project' })
      .expect(201)
    const projectId = projectRes.body.data.id

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

  it('auto-provisions a 4-layer exterior assembly (render/block/finish/paint) on first access', async () => {
    const wallRes = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 5, endY: 0, floor: 0, isExterior: true })
      .expect(201)
    const wallId = wallRes.body.data.id

    const layersRes = await request(server)
      .get(`/api/v1/houses/walls/${wallId}/layers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const layers = layersRes.body.data
    expect(layers).toHaveLength(4)
    expect(layers.map((l: { function: string }) => l.function)).toEqual([
      'RENDER',
      'STRUCTURAL',
      'FINISH',
      'PAINT',
    ])
    expect(layers[1].material.name).toBe('Leiertherm 38 N+F')
    expect(layers[1].thicknessMm).toBe(380)
    expect(layers[1].material.standardRef).toBe('Leier Leiertherm 38 N+F')

    // Second call must be idempotent (not re-provision/duplicate).
    const layersRes2 = await request(server)
      .get(`/api/v1/houses/walls/${wallId}/layers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(layersRes2.body.data).toHaveLength(4)
  })

  it('auto-provisions a 3-layer interior assembly (finish/brick/finish) for a non-exterior wall', async () => {
    const wallRes = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 3, endY: 0, floor: 0, isExterior: false })
      .expect(201)
    const wallId = wallRes.body.data.id

    const layersRes = await request(server)
      .get(`/api/v1/houses/walls/${wallId}/layers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const layers = layersRes.body.data
    expect(layers).toHaveLength(3)
    expect(layers[1].material.name).toBe('Cărămidă plină arsă')
    expect(layers[1].material.standardRef).toBe('STAS 2945/73')
  })
})
