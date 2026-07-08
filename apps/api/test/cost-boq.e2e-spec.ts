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
  let wallId: string

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
    const wallRes = await request(server)
      .post(`/api/v1/houses/${houseId}/walls`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ startX: 0, startY: 0, endX: 10, endY: 0, floor: 0, height: 2.5, isExterior: true })
      .expect(201)
    wallId = wallRes.body.data.id
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

  it('subtracts door/window openings from the wall BOQ (net area)', async () => {
    // A 1.5m × 1.2m window -> 1.8 m² subtracted from the 25 m² wall.
    await request(server)
      .post(`/api/v1/houses/${houseId}/openings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ wallId, type: 'WINDOW', position: 4, width: 1.5, height: 1.2, sillHeight: 0.9 })
      .expect(201)

    const res = await request(server)
      .post(`/api/v1/costs/houses/${houseId}/estimate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)

    const breakdown: Array<{ category: string; name: string; quantity: number }> =
      res.body.data.breakdown

    const structuralLine = breakdown.find((l) => l.category === 'wall-structural')
    // 23.2 m² net * 16 pcs/m² (Leier N+F piecesPerM2) = 371.2 pieces.
    expect(structuralLine!.quantity).toBeCloseTo((25 - 1.8) * 16, 5)

    const renderLine = breakdown.find((l) => l.category === 'wall-render')
    expect(renderLine!.quantity).toBeCloseTo(25 - 1.8, 5)
  })
})
