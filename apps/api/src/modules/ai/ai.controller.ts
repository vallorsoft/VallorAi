import { Controller, Get, Post, Param, Body, Sse, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { Observable } from 'rxjs'
import { AiService } from './ai.service'

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
  ) {
    return this.aiService.chat(projectId, body.message, body.language)
  }

  @Sse('projects/:id/stream')
  stream(
    @Param('id') projectId: string,
    @Body() body: { message: string; language?: string },
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const generator = this.aiService.streamChat(projectId, body.message, body.language)
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
  getConversation(@Param('id') projectId: string) {
    return this.aiService.getConversation(projectId)
  }
}
