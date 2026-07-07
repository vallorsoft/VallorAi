import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SettingsService } from './settings.service'

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPERADMIN')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('ai')
  getAiSettings() {
    return this.settingsService.getAiSettings()
  }

  @Patch('ai')
  updateAiSettings(@Body() body: { allowPaidAiProviders: boolean }) {
    return this.settingsService.setAllowPaidAiProviders(body.allowPaidAiProviders)
  }
}
