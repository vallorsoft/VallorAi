import { Module } from '@nestjs/common'
import { HousesController } from './houses.controller'
import { HousesService } from './houses.service'
import { ProjectVersionsModule } from '../project-versions/project-versions.module'

@Module({
  imports: [ProjectVersionsModule],
  controllers: [HousesController],
  providers: [HousesService],
  exports: [HousesService],
})
export class HousesModule {}
