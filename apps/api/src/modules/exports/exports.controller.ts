import { Controller, Get, Post, Delete, Param, Body, UseGuards, Res, Req, Request } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { FastifyReply } from 'fastify'
import { ExportsService } from './exports.service'

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('projects/:id/summary')
  getSummary(@Param('id') projectId: string) {
    return this.exportsService.generateProjectSummary(projectId)
  }

  @Get('projects/:id/dxf')
  async getDxf(
    @Param('id') projectId: string,
    @Req() req: { user: { id: string } },
    @Res() reply: FastifyReply,
  ) {
    const content = await this.exportsService.generateDxfForProject(projectId, req.user.id)
    reply
      .header('Content-Type', 'application/dxf')
      .header('Content-Disposition', `attachment; filename="proiect-${projectId}.dxf"`)
      .send(content)
  }

  @Get('projects/:id/floor-plan-pdf')
  async getFloorPlanPdf(
    @Param('id') projectId: string,
    @Req() req: { user: { id: string } },
    @Res() reply: FastifyReply,
  ) {
    const buffer = await this.exportsService.generateFloorPlanPdfForProject(projectId, req.user.id)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="alaprajz.pdf"')
      .send(buffer)
  }

  @Get('projects/:id/ifc')
  async getIfc(
    @Param('id') projectId: string,
    @Req() req: { user: { id: string } },
    @Res() reply: FastifyReply,
  ) {
    const content = await this.exportsService.generateIfcForProject(projectId, req.user.id)
    reply
      .header('Content-Type', 'application/x-step')
      .header('Content-Disposition', 'attachment; filename="model.ifc"')
      .send(content)
  }

  @Get('projects/:id/permit-doc')
  async getPermitDoc(
    @Param('id') projectId: string,
    @Req() req: { user: { id: string } },
    @Res() reply: FastifyReply,
  ) {
    const buffer = await this.exportsService.generatePermitDocForProject(projectId, req.user.id)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="dtac-rezumat.pdf"')
      .send(buffer)
  }

  @Get('projects/:id/documents')
  listDocuments(@Param('id') projectId: string) {
    return this.exportsService.listDocuments(projectId)
  }

  @Post('projects/:id/documents')
  createDocument(
    @Param('id') projectId: string,
    @Body() body: { type: string; title: string; fileUrl?: string; metadata?: Record<string, unknown> },
  ) {
    return this.exportsService.createDocument(projectId, body)
  }

  @Delete('documents/:id')
  deleteDocument(@Param('id') documentId: string) {
    return this.exportsService.deleteDocument(documentId)
  }
}
