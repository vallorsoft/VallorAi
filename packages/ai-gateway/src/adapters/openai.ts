import OpenAI from 'openai'
import type { AIAdapter, AICompletionOptions, AICompletionResult } from '../interface'

export class OpenAIAdapter implements AIAdapter {
  readonly provider = 'OPENAI'
  readonly model: string
  private client: OpenAI

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    })

    const choice = response.choices[0]
    return {
      content: choice.message.content ?? '',
      provider: this.provider,
      model: this.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    }
  }

  async *stream(options: AICompletionOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }
}
