import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { CostsService } from './costs.service'

@ApiTags('costs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('costs')
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Post('projects/:id/estimate')
  estimateByProject(@Param('id') projectId: string) {
    return this.costsService.estimateByProject(projectId)
  }

  @Get('projects/:id')
  getByProject(@Param('id') projectId: string) {
    return this.costsService.getByProject(projectId)
  }

  @Post('houses/:id/estimate')
  estimateByHouse(@Param('id') houseId: string) {
    return this.costsService.estimateByArea(houseId)
  }

  @Get('houses/:id')
  getByHouse(@Param('id') houseId: string) {
    return this.costsService.getEstimate(houseId)
  }
}
