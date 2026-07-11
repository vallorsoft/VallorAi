import { Module } from '@nestjs/common'
import { ExportsController } from './exports.controller'
import { ExportsService } from './exports.service'
import { ProjectsModule } from '../projects/projects.module'
import { RulesModule } from '../rules/rules.module'

@Module({
  imports: [ProjectsModule, RulesModule],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
