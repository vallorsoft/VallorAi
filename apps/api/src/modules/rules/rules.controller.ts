import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RulesService } from './rules.service'

@ApiTags('rules')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post('validate')
  validate(@Body() body: { house: Parameters<RulesService['validate']>[0]; country?: string }) {
    return this.rulesService.validate(body.house, body.country)
  }
}
