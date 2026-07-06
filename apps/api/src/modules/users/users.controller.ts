import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Request() req: { user: { id: string } }) {
    return this.usersService.findById(req.user.id)
  }

  @Patch('me')
  updateMe(
    @Request() req: { user: { id: string } },
    @Body() body: { name?: string; language?: string },
  ) {
    return this.usersService.update(req.user.id, body)
  }
}
