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
    return this.projectsService.findAll(req.user.id)
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

  @Get(':id/versions')
  listVersions(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.listVersions(id, req.user.id)
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.restoreVersion(id, versionId, req.user.id)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Collaboration endpoints
  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id/members')
  getMembers(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.getProjectMembers(id, req.user.id)
  }

  @Post(':id/members/invite')
  inviteMember(
    @Param('id') id: string,
    @Body() body: { email: string; role: 'EDITOR' | 'VIEWER' },
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.inviteMember(id, req.user.id, body.email, body.role)
  }

  @Post(':id/members/accept')
  acceptInvite(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.acceptInvite(id, req.user.id)
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.removeMember(id, req.user.id, targetUserId)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Task endpoints
  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id/tasks')
  getProjectTasks(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.projectsService.getProjectTasks(id, req.user.id)
  }

  @Post(':id/tasks')
  createTask(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body()
    dto: {
      title: string
      description?: string
      priority?: 'LOW' | 'MEDIUM' | 'HIGH'
      assignedToId?: string
      dueDate?: string
    },
  ) {
    return this.projectsService.createTask(id, req.user.id, dto)
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Request() req: { user: { id: string } },
    @Body()
    dto: {
      title?: string
      description?: string
      status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
      priority?: 'LOW' | 'MEDIUM' | 'HIGH'
      assignedToId?: string | null
      dueDate?: string | null
    },
  ) {
    return this.projectsService.updateTask(id, taskId, req.user.id, dto)
  }

  @Delete(':id/tasks/:taskId')
  deleteTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.projectsService.deleteTask(id, taskId, req.user.id)
  }
}
