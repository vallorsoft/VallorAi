import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AIGateway } from '@ai-home-designer/ai-gateway'
import { prisma, Prisma } from '@ai-home-designer/database'
import { getSystemPromptForLanguage } from './prompts/system.prompt'
import { parseDesignResponse } from './schemas/design-response.schema'

@Injectable()
export class AiService {
  private readonly gateway: AIGateway

  constructor(config: ConfigService) {
    this.gateway = new AIGateway({
      defaultProvider: (config.get('AI_PROVIDER') as never) ?? 'GEMINI',
      providers: {
        GEMINI: {
          apiKey: config.get('GEMINI_API_KEY') ?? '',
          model: config.get('GEMINI_MODEL') ?? 'gemini-1.5-pro',
        },
        CLAUDE: {
          apiKey: config.get('ANTHROPIC_API_KEY') ?? '',
          model: config.get('CLAUDE_MODEL') ?? 'claude-sonnet-5',
        },
        OPENAI: {
          apiKey: config.get('OPENAI_API_KEY') ?? '',
          model: config.get('OPENAI_MODEL') ?? 'gpt-4o',
        },
      },
    })
  }

  async chat(projectId: string, userMessage: string, language = 'ro') {
    const history = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const systemPrompt = this.getSystemPrompt(language)

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    await prisma.message.create({
      data: { projectId, role: 'user', content: userMessage },
    })

    const result = await this.gateway.complete({ messages })

    await prisma.message.create({
      data: {
        projectId,
        role: 'assistant',
        content: result.content,
        metadata: this.buildAssistantMetadata(result.content),
      },
    })

    return { response: result.content, provider: result.provider }
  }

  async *streamChat(projectId: string, userMessage: string, language = 'ro') {
    const history = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const messages = [
      { role: 'system' as const, content: this.getSystemPrompt(language) },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessage },
    ]

    await prisma.message.create({ data: { projectId, role: 'user', content: userMessage } })

    let fullResponse = ''
    for await (const chunk of this.gateway.stream({ messages })) {
      fullResponse += chunk
      yield chunk
    }

    await prisma.message.create({
      data: {
        projectId,
        role: 'assistant',
        content: fullResponse,
        metadata: this.buildAssistantMetadata(fullResponse),
      },
    })
  }

  getConversation(projectId: string) {
    return prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })
  }

  private getSystemPrompt(language: string): string {
    return getSystemPromptForLanguage(language)
  }

  /**
   * Attempts to parse the assistant's raw content as a structured design
   * response. Never throws: on success, returns the parsed object so it can
   * be stored alongside the raw content; on failure, returns a small
   * validationError marker for debugging without breaking the chat flow.
   */
  private buildAssistantMetadata(rawContent: string): Prisma.InputJsonValue {
    const parsed = parseDesignResponse(rawContent)
    if (parsed.success) {
      return { ...parsed.data } as Prisma.InputJsonValue
    }
    return { validationError: parsed.error } as Prisma.InputJsonValue
  }
}
