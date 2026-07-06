import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { ProjectsService } from './projects.service'

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.projectsService.findAllByUser(req.user.id)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.findOne(id, req.user.id)
  }

  @Post()
  create(
    @Body() body: { name: string; type?: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.create(req.user.id, body)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; status?: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.update(id, req.user.id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.remove(id, req.user.id)
  }

  @Patch(':id/plot')
  updatePlot(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.updatePlot(id, req.user.id, body)
  }

  @Patch(':id/lifestyle')
  updateLifestyle(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.updateLifestyle(id, req.user.id, body)
  }

  @Patch(':id/budget')
  updateBudget(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.updateBudget(id, req.user.id, body)
  }
}
