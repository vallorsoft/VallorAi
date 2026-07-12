import { Module } from '@nestjs/common'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { ProjectVersionsModule } from '../project-versions/project-versions.module'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [ProjectVersionsModule, MailModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
