import { Controller, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { AdminService } from './admin.service'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPERADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats()
  }

  @Get('users')
  listUsers(@Query('page') page?: string, @Query('perPage') perPage?: string) {
    return this.adminService.listUsers(
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 50,
    )
  }

  @Patch('users/:id/role')
  setUserRole(@Param('id') userId: string, @Body() body: { role: string }) {
    return this.adminService.setUserRole(userId, body.role)
  }
}
