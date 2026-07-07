import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AIAdapter, AICompletionOptions, AICompletionResult } from '../interface'
import { AIQuotaExceededError, isQuotaExceededMessage, isTransientOverloadMessage, retryOnOverload } from '../errors'

export class GeminiAdapter implements AIAdapter {
  readonly provider = 'GEMINI'
  readonly model: string
  private client: GoogleGenerativeAI

  constructor(apiKey: string, model = 'gemini-flash-latest') {
    this.client = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  private rethrowIfQuotaExceeded(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err)
    if (isQuotaExceededMessage(message) || isTransientOverloadMessage(message)) {
      throw new AIQuotaExceededError(this.provider, message)
    }
    throw err
  }

  private buildRequest(options: AICompletionOptions) {
    const systemMessage = options.messages.find((m) => m.role === 'system')
    const conversation = options.messages.filter((m) => m.role !== 'system')

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemMessage?.content,
    })

    const history = conversation.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }))

    const lastMessage = conversation[conversation.length - 1]?.content ?? ''

    return { model, history, lastMessage }
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const { model, history, lastMessage } = this.buildRequest(options)

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    })

    try {
      // Google's own "high demand" 503 explicitly says it's usually momentary
      // — worth a couple of short retries before treating it as unavailable.
      const result = await retryOnOverload(() => chat.sendMessage(lastMessage))
      const response = result.response
      const usage = response.usageMetadata

      return {
        content: response.text(),
        provider: this.provider,
        model: this.model,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      }
    } catch (err) {
      this.rethrowIfQuotaExceeded(err)
    }
  }

  async *stream(options: AICompletionOptions): AsyncIterable<string> {
    const { model, history, lastMessage } = this.buildRequest(options)

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    })

    try {
      const result = await retryOnOverload(() => chat.sendMessageStream(lastMessage))
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) yield text
      }
    } catch (err) {
      this.rethrowIfQuotaExceeded(err)
    }
  }
}
