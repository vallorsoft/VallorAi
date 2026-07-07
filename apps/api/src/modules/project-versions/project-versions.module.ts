import { Module } from '@nestjs/common'
import { ProjectVersionsService } from './project-versions.service'

@Module({
  providers: [ProjectVersionsService],
  exports: [ProjectVersionsService],
})
export class ProjectVersionsModule {}
