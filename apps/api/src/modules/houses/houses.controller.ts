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

  @Get(':id/tie-columns')
  getTieColumns(@Param('id') houseId: string) {
    return this.housesService.getTieColumns(houseId)
  }

  @Get('openings/:id/lintel')
  getLintel(@Param('id') openingId: string) {
    return this.housesService.getLintel(openingId)
  }

  @Get(':id/centuri')
  getCenturi(@Param('id') houseId: string) {
    return this.housesService.getCenturi(houseId)
  }

  @Get(':id/roof')
  getRoof(@Param('id') houseId: string) {
    return this.housesService.getRoof(houseId)
  }

  @Patch(':id/roof')
  updateRoof(
    @Param('id') houseId: string,
    @Body() body: { type?: string; pitchDeg?: number; overhangM?: number },
    @Request() req: { user: { id: string } },
  ) {
    return this.housesService.updateRoof(houseId, body, req.user.id)
  }

  @Get(':id/staircases')
  getStaircases(@Param('id') houseId: string) {
    return this.housesService.getStaircases(houseId)
  }

  @Post(':id/staircases')
  createStaircase(
    @Param('id') houseId: string,
    @Body()
    body: {
      floor: number
      posX?: number
      posY?: number
      widthMm?: number
      floorHeightMm?: number
      handedness?: string
    },
  ) {
    return this.housesService.createStaircase(houseId, body)
  }

  @Delete(':id/staircases/:staircaseId')
  removeStaircase(
    @Param('id') houseId: string,
    @Param('staircaseId') staircaseId: string,
  ) {
    return this.housesService.removeStaircase(houseId, staircaseId)
  }

  @Get(':id/mep')
  getMepPoints(@Param('id') houseId: string) {
    return this.housesService.getMepPoints(houseId)
  }

  @Post(':id/mep/regenerate')
  regenerateMepPoints(@Param('id') houseId: string) {
    return this.housesService.regenerateMepPoints(houseId)
  }
}
