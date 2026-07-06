import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AIGateway } from '@ai-home-designer/ai-gateway'
import { prisma } from '@ai-home-designer/database'
import { SYSTEM_PROMPT_RO } from './prompts/system.prompt'

@Injectable()
export class AiService {
  private readonly gateway: AIGateway

  constructor(private readonly config: ConfigService) {
    this.gateway = new AIGateway({
      defaultProvider: (config.get('AI_PROVIDER') as never) ?? 'CLAUDE',
      providers: {
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
      data: { projectId, role: 'assistant', content: result.content },
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

    await prisma.message.create({ data: { projectId, role: 'assistant', content: fullResponse } })
  }

  getConversation(projectId: string) {
    return prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })
  }

  private getSystemPrompt(language: string): string {
    if (language === 'ro') return SYSTEM_PROMPT_RO
    return SYSTEM_PROMPT_RO
  }
}
