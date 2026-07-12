import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { MarketplaceService } from './marketplace.service'

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('materials')
  listMaterials(
    @Query('category') category?: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.marketplaceService.listMaterials({
      category,
      supplierId,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
    })
  }

  @Get('suppliers')
  listSuppliers() {
    return this.marketplaceService.listSuppliers()
  }

  @Get('materials/:id')
  getMaterial(@Param('id') id: string) {
    return this.marketplaceService.getMaterial(id)
  }
}
