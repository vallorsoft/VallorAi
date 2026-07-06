import Anthropic from '@anthropic-ai/sdk'
import type { AIAdapter, AICompletionOptions, AICompletionResult } from '../interface'

export class ClaudeAdapter implements AIAdapter {
  readonly provider = 'CLAUDE'
  readonly model: string
  private client: Anthropic

  constructor(apiKey: string, model = 'claude-sonnet-5') {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === 'system')
    const userMessages = options.messages.filter((m) => m.role !== 'system')

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    return {
      content: content.text,
      provider: this.provider,
      model: this.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }

  async *stream(options: AICompletionOptions): AsyncIterable<string> {
    const systemMessage = options.messages.find((m) => m.role === 'system')
    const userMessages = options.messages.filter((m) => m.role !== 'system')

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text
      }
    }
  }
}
