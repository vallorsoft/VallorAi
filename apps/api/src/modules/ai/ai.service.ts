import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AIGateway,
  AIQuotaExceededError,
  type AICompletionResult,
  type AIMessage,
  type ProviderName,
} from '@ai-home-designer/ai-gateway'
import { prisma, Prisma } from '@ai-home-designer/database'
import { getSystemPromptForLanguage } from './prompts/system.prompt'
import { parseDesignResponse } from './schemas/design-response.schema'
import { SettingsService } from '../settings/settings.service'

@Injectable()
export class AiService {
  private readonly gateway: AIGateway

  constructor(
    config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    this.gateway = new AIGateway({
      defaultProvider: (config.get('AI_PROVIDER') as never) ?? 'GEMINI',
      providers: {
        GEMINI: {
          apiKey: config.get('GEMINI_API_KEY') ?? '',
          // gemini-1.5-pro was retired by Google (404s on generateContent as of
          // mid-2026) — gemini-flash-latest is Google's maintained alias to
          // their current recommended flash model, so it won't go stale the
          // same way a pinned dated model name eventually will.
          model: config.get('GEMINI_MODEL') ?? 'gemini-flash-latest',
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

    const result = await this.completeWithQuotaFallback(messages)

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
    let yieldedAny = false
    try {
      for await (const chunk of this.gateway.stream({ messages })) {
        yieldedAny = true
        fullResponse += chunk
        yield chunk
      }
    } catch (err) {
      // Only safe to retry on a different provider if nothing has reached
      // the client yet — once part of a response is already streamed out,
      // there's no clean way to "take it back" and restart elsewhere.
      if (yieldedAny || !(err instanceof AIQuotaExceededError)) throw err
      const fallbackProvider = await this.resolvePaidFallback(err.provider)
      if (!fallbackProvider) throw this.quotaExceededException()
      for await (const chunk of this.gateway.stream({ messages, provider: fallbackProvider })) {
        fullResponse += chunk
        yield chunk
      }
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

  private async completeWithQuotaFallback(messages: AIMessage[]): Promise<AICompletionResult> {
    try {
      return await this.gateway.complete({ messages })
    } catch (err) {
      if (!(err instanceof AIQuotaExceededError)) throw err
      const fallbackProvider = await this.resolvePaidFallback(err.provider)
      if (!fallbackProvider) throw this.quotaExceededException()
      return this.gateway.complete({ messages, provider: fallbackProvider })
    }
  }

  /** Only offers a fallback when a SUPERADMIN has explicitly opted into paid
   * providers AND a different provider actually has a real API key
   * configured — otherwise there's nothing sensible to fall back to. */
  private async resolvePaidFallback(exhaustedProvider: string): Promise<ProviderName | undefined> {
    const settings = await this.settingsService.getAiSettings()
    if (!settings.allowPaidAiProviders) return undefined
    return this.gateway
      .configuredProviders()
      .find((provider) => provider !== exhaustedProvider.toUpperCase())
  }

  private quotaExceededException(): HttpException {
    return new HttpException(
      'AI free-tier quota exceeded. Please try again later.',
      HttpStatus.SERVICE_UNAVAILABLE,
    )
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
