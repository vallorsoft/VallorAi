import { Module } from '@nestjs/common'
import { CostsController } from './costs.controller'
import { CostsService } from './costs.service'
import { HousesModule } from '../houses/houses.module'

@Module({
  imports: [HousesModule],
  controllers: [CostsController],
  providers: [CostsService],
  exports: [CostsService],
})
export class CostsModule {}
