import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { HousesService } from './houses.service'

@ApiTags('houses')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('houses')
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get('projects/:id')
  findByProject(@Param('id') projectId: string) {
    return this.housesService.findByProject(projectId)
  }

  @Post('projects/:id')
  upsert(@Param('id') projectId: string, @Body() body: { floors?: number; roofType?: string }) {
    return this.housesService.upsert(projectId, body)
  }

  @Post(':id/rooms')
  addRoom(
    @Param('id') houseId: string,
    @Body() body: object,
    @Request() req: { user: { id: string } },
  ) {
    return this.housesService.addRoom(houseId, body as never, req.user.id)
  }

  @Patch('rooms/:id')
  updateRoom(
    @Param('id') roomId: string,
    @Body() body: object,
    @Request() req: { user: { id: string } },
  ) {
    return this.housesService.updateRoom(roomId, body, req.user.id)
  }

  @Delete('rooms/:id')
  removeRoom(@Param('id') roomId: string, @Request() req: { user: { id: string } }) {
    return this.housesService.removeRoom(roomId, req.user.id)
  }

  @Post(':id/walls')
  addWall(
    @Param('id') houseId: string,
    @Body() body: object,
    @Request() req: { user: { id: string } },
  ) {
    return this.housesService.addWall(houseId, body as never, req.user.id)
  }

  @Patch('walls/:id')
  updateWall(
    @Param('id') wallId: string,
    @Body() body: object,
    @Request() req: { user: { id: string } },
  ) {
    return this.housesService.updateWall(wallId, body, req.user.id)
  }

  @Post(':id/openings')
  addOpening(
    @Param('id') houseId: string,
    @Body() body: { wallId: string } & Record<string, unknown>,
    @Request() req: { user: { id: string } },
  ) {
    const { wallId, ...data } = body
    return this.housesService.addOpening(houseId, wallId, data as never, req.user.id)
  }

  @Get('walls/:id/layers')
  getWallLayers(@Param('id') wallId: string) {
    return this.housesService.getWallLayers(wallId)
  }

  @Get('walls/:id/reinforcement')
  getWallReinforcement(@Param('id') wallId: string) {
    return this.housesService.getWallReinforcement(wallId)
  }

  @Get(':id/foundation')
  getFoundation(@Param('id') houseId: string) {
    return this.housesService.getFoundation(houseId)
  }
}
