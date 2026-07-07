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
import { parseDesignResponse, type DesignResponse } from './schemas/design-response.schema'
import { nextRoomPosition, roomFromDesignUpdateData } from './design-update-mapper'
import { SettingsService } from '../settings/settings.service'
import { HousesService } from '../houses/houses.service'
import { ProjectsService } from '../projects/projects.service'

export interface AppliedRoomInfo {
  action: 'created' | 'updated'
  name: string
  area: number
  floor: number
}

@Injectable()
export class AiService {
  private readonly gateway: AIGateway

  constructor(
    config: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly housesService: HousesService,
    private readonly projectsService: ProjectsService,
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
          // gpt-4o still works via the API but is no longer OpenAI's
          // recommended default — gpt-5.5 is, as of mid-2026.
          model: config.get('OPENAI_MODEL') ?? 'gpt-5.5',
        },
      },
    })
  }

  async chat(projectId: string, userId: string, userMessage: string, language = 'ro') {
    await this.projectsService.assertOwnership(projectId, userId)

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
        metadata: await this.buildAssistantMetadata(projectId, userId, result.content),
      },
    })

    return { response: result.content, provider: result.provider }
  }

  async *streamChat(projectId: string, userId: string, userMessage: string, language = 'ro') {
    await this.projectsService.assertOwnership(projectId, userId)

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
        metadata: await this.buildAssistantMetadata(projectId, userId, fullResponse),
      },
    })
  }

  getConversation(projectId: string, userId: string) {
    return this.projectsService.assertOwnership(projectId, userId).then(() =>
      prisma.message.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      }),
    )
  }

  /**
   * Replays every design_update already parsed and stored in this project's
   * message history (see buildAssistantMetadata) and (re-)applies the ones
   * that haven't been applied yet. This is what repairs a project whose
   * conversation happened before design_update application was wired up —
   * the AI's room decisions were always saved to Message.metadata, they were
   * just never turned into real Room rows. Idempotent: messages already
   * marked with an `appliedRoom` result are skipped.
   */
  async rebuildFromConversation(projectId: string, userId: string) {
    await this.projectsService.assertOwnership(projectId, userId)

    const messages = await prisma.message.findMany({
      where: { projectId, role: 'assistant' },
      orderBy: { createdAt: 'asc' },
    })

    const applied: AppliedRoomInfo[] = []
    for (const message of messages) {
      const metadata = (message.metadata ?? {}) as Record<string, unknown>
      if (metadata.appliedRoom) continue // already applied — keep this idempotent
      const designUpdate = metadata.design_update as DesignResponse['design_update'] | undefined
      if (!designUpdate) continue

      const appliedRoom = await this.applyDesignUpdate(projectId, userId, designUpdate)
      if (!appliedRoom) continue

      applied.push(appliedRoom)
      await prisma.message.update({
        where: { id: message.id },
        data: { metadata: { ...metadata, appliedRoom } as unknown as Prisma.InputJsonValue },
      })
    }

    return { appliedCount: applied.length, applied }
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
   * response and, when it contains a real ADD_ROOM/UPDATE_ROOM, applies it
   * (see applyDesignUpdate) so the described house actually appears in the
   * 2D/3D editor instead of only existing in the chat transcript. Never
   * throws: on parse failure, returns a small validationError marker for
   * debugging without breaking the chat flow.
   */
  private async buildAssistantMetadata(
    projectId: string,
    userId: string,
    rawContent: string,
  ): Promise<Prisma.InputJsonValue> {
    const parsed = parseDesignResponse(rawContent)
    if (!parsed.success || !parsed.data) {
      return { validationError: parsed.error } as Prisma.InputJsonValue
    }

    const appliedRoom = parsed.data.design_update
      ? await this.applyDesignUpdate(projectId, userId, parsed.data.design_update)
      : null

    return { ...parsed.data, appliedRoom } as Prisma.InputJsonValue
  }

  /**
   * Turns one design_update action into a real Room row. Only ADD_ROOM and
   * UPDATE_ROOM are handled — ADD_WALL/other actions mentioned in the system
   * prompt as an open-ended "etc" are left as a documented gap rather than
   * guessing wall geometry the AI has never been observed to actually emit.
   *
   * UPDATE_ROOM tries to find an existing room on the same floor with an
   * exact `type` match and updates it in place; with no match (the AI's
   * room_type wording drifts between turns), it falls back to creating a new
   * room, same as ADD_ROOM — a deliberately simple heuristic rather than
   * fuzzy-matching the AI's free-text room types across turns.
   */
  private async applyDesignUpdate(
    projectId: string,
    userId: string,
    designUpdate: NonNullable<DesignResponse['design_update']>,
  ): Promise<AppliedRoomInfo | null> {
    if (designUpdate.action !== 'ADD_ROOM' && designUpdate.action !== 'UPDATE_ROOM') return null

    const mapped = roomFromDesignUpdateData(designUpdate.data)
    if (!mapped) return null

    const house = await this.housesService.upsert(projectId, {})

    if (designUpdate.action === 'UPDATE_ROOM') {
      const existing = await prisma.room.findFirst({
        where: { houseId: house.id, floor: mapped.floor, type: mapped.type },
      })
      if (existing) {
        const updated = await this.housesService.updateRoom(
          existing.id,
          { area: mapped.area, width: mapped.width, height: mapped.height },
          userId,
        )
        await this.housesService.recalculateTotalArea(house.id)
        return { action: 'updated', name: mapped.name, area: updated.area, floor: updated.floor }
      }
    }

    const roomsOnFloor = await prisma.room.findMany({
      where: { houseId: house.id, floor: mapped.floor },
      select: { posX: true, width: true },
    })
    const { posX, posY } = nextRoomPosition(roomsOnFloor, mapped.floor)

    const created = await this.housesService.addRoom(
      house.id,
      { ...mapped, posX, posY },
      userId,
    )
    await this.housesService.recalculateTotalArea(house.id)

    return { action: 'created', name: mapped.name, area: created.area, floor: created.floor }
  }
}
