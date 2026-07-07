import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { ProjectsModule } from '../projects/projects.module'
import { SettingsModule } from '../settings/settings.module'

@Module({
  imports: [ProjectsModule, SettingsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
