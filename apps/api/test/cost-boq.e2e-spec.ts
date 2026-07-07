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

describe('Cost engine BOQ integration (e2e)', () => {
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

    const email = `cost-boq-${Date.now()}@example.com`
    accessToken = await registerAndVerify(server, email, 'Cost BOQ Test')

    const projectRes = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cost BOQ Project' })
      .expect(201)
    const projectId = projectRes.body.data.id

    const houseRes = await request(server)
      .post(`/api/v1/houses/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ floors: 1, roofType: 'GABLED' })
      .expect(201)
    houseId = houseRes.body.data.id

    // A 10m x 2.5m exterior wall -> 25 m² of exterior assembly.
    await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 10, endY: 0, floor: 0, height: 2.5, isExterior: true })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
  })

  it('computes real per-material BOQ lines from the wall assembly instead of a flat masonry guess', async () => {
    const res = await request(server)
      .post(`/api/v1/costs/houses/${houseId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const breakdown: Array<{
      category: string
      name: string
      quantity: number
      unit: string
      unitPrice: number
      priceVerified?: boolean
    }> = res.body.data.breakdown

    // The flat "masonry" guess must be gone, replaced by real wall-structural lines.
    expect(breakdown.some((l) => l.category === 'masonry')).toBe(false)

    const structuralLine = breakdown.find((l) => l.category === 'wall-structural')
    expect(structuralLine).toBeDefined()
    expect(structuralLine!.name).toBe('Leiertherm 38 N+F')
    // 25 m² * 16 pcs/m² (Leier N+F piecesPerM2) = 400 pieces.
    expect(structuralLine!.quantity).toBeCloseTo(400, 5)
    expect(structuralLine!.priceVerified).toBe(false)

    const renderLine = breakdown.find((l) => l.category === 'wall-render')
    expect(renderLine).toBeDefined()
    expect(renderLine!.quantity).toBeCloseTo(25, 5) // m² default for an M2-unit material

    expect(res.body.data.total).toBeGreaterThan(0)
  })
})
