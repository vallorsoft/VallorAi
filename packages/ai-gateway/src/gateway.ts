import type { AIAdapter, AICompletionOptions, AICompletionResult } from './interface'
import { ClaudeAdapter } from './adapters/claude'
import { OpenAIAdapter } from './adapters/openai'
import { GeminiAdapter } from './adapters/gemini'

export type ProviderName = 'CLAUDE' | 'OPENAI' | 'GEMINI' | 'DEEPSEEK' | 'MISTRAL' | 'LOCAL'

export interface GatewayConfig {
  defaultProvider: ProviderName
  providers: Partial<Record<ProviderName, { apiKey: string; model?: string }>>
}

export class AIGateway {
  private adapters = new Map<ProviderName, AIAdapter>()
  private defaultProvider: ProviderName

  constructor(config: GatewayConfig) {
    this.defaultProvider = config.defaultProvider

    if (config.providers.CLAUDE) {
      this.adapters.set(
        'CLAUDE',
        new ClaudeAdapter(config.providers.CLAUDE.apiKey, config.providers.CLAUDE.model),
      )
    }
    if (config.providers.OPENAI) {
      this.adapters.set(
        'OPENAI',
        new OpenAIAdapter(config.providers.OPENAI.apiKey, config.providers.OPENAI.model),
      )
    }
    if (config.providers.GEMINI) {
      this.adapters.set(
        'GEMINI',
        new GeminiAdapter(config.providers.GEMINI.apiKey, config.providers.GEMINI.model),
      )
    }
  }

  private getAdapter(provider?: ProviderName): AIAdapter {
    const name = provider ?? this.defaultProvider
    const adapter = this.adapters.get(name)
    if (!adapter) throw new Error(`AI provider ${name} is not configured`)
    return adapter
  }

  async complete(
    options: AICompletionOptions & { provider?: ProviderName },
  ): Promise<AICompletionResult> {
    return this.getAdapter(options.provider).complete(options)
  }

  stream(
    options: AICompletionOptions & { provider?: ProviderName },
  ): AsyncIterable<string> {
    return this.getAdapter(options.provider).stream(options)
  }
}
