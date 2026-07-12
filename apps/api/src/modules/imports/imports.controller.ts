import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { ImportsService } from './imports.service'

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /** Accept a base64-encoded floor-plan image and create rooms from it.
   *  Body: { imageBase64: string, mimeType: string, projectId: string } */
  @Post('floor-plan')
  importFloorPlan(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      imageBase64: string
      mimeType: string
      projectId: string
    },
  ) {
    return this.importsService.importFloorPlan({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      projectId: body.projectId,
      userId: req.user.id,
    })
  }
}
