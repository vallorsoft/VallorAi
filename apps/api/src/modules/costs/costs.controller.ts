import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { CostsService } from './costs.service'
import { ProjectsService } from '../projects/projects.service'

@ApiTags('costs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('costs')
export class CostsController {
  constructor(
    private readonly costsService: CostsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post('projects/:id/estimate')
  async estimateByProject(
    @Param('id') projectId: string,
    @Request() req: { user: { id: string } },
  ) {
    await this.projectsService.assertOwnership(projectId, req.user.id)
    return this.costsService.estimateByProject(projectId)
  }

  @Get('projects/:id')
  async getByProject(
    @Param('id') projectId: string,
    @Request() req: { user: { id: string } },
  ) {
    await this.projectsService.assertOwnership(projectId, req.user.id)
    return this.costsService.getByProject(projectId)
  }

  /**
   * Live BOQ read for the editor's cost inspector panel: runs a fresh
   * estimate (so the breakdown reflects the current wall/opening/roof state)
   * and returns the full `{ breakdown, total, currency }` shape the flat
   * getByProject cache also has. Ownership-checked the same way every other
   * project-scoped read in the app is (ProjectsService.assertOwnership).
   */
  @Get('projects/:id/estimate')
  async getProjectEstimate(
    @Param('id') projectId: string,
    @Request() req: { user: { id: string } },
  ) {
    await this.projectsService.assertOwnership(projectId, req.user.id)
    return this.costsService.estimateByProject(projectId)
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
