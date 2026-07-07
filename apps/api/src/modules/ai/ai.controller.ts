import { Controller, Get, Post, Param, Body, Sse, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { Observable } from 'rxjs'
import { AiService } from './ai.service'
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator'

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('projects/:id/chat')
  chat(
    @Param('id') projectId: string,
    @Body() body: { message: string; language?: string },
    @Request() req: { user: { id: string } },
  ) {
    return this.aiService.chat(projectId, req.user.id, body.message, body.language)
  }

  @Sse('projects/:id/stream')
  @SkipEnvelope()
  stream(
    @Param('id') projectId: string,
    @Body() body: { message: string; language?: string },
    @Request() req: { user: { id: string } },
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const generator = this.aiService.streamChat(
        projectId,
        req.user.id,
        body.message,
        body.language,
      )
      const process = async () => {
        for await (const chunk of generator) {
          subscriber.next({ data: chunk } as MessageEvent)
        }
        subscriber.complete()
      }
      process().catch((err) => subscriber.error(err))
    })
  }

  @Get('projects/:id/conversation')
  getConversation(@Param('id') projectId: string, @Request() req: { user: { id: string } }) {
    return this.aiService.getConversation(projectId, req.user.id)
  }

  /**
   * Repairs a project whose AI conversation happened before design_update
   * application was wired up (or whose chat otherwise failed to apply a
   * turn): replays the design_update already stored in each assistant
   * message's metadata and creates/updates the corresponding rooms. Safe to
   * call repeatedly — already-applied messages are skipped.
   */
  @Post('projects/:id/rebuild')
  rebuild(@Param('id') projectId: string, @Request() req: { user: { id: string } }) {
    return this.aiService.rebuildFromConversation(projectId, req.user.id)
  }
}
