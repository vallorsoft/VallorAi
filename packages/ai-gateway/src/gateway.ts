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
    // Normalize so a mistyped/miscased env value (e.g. "Gemini" instead of
    // "GEMINI") doesn't silently break the default provider lookup below.
    this.defaultProvider = (
      String(config.defaultProvider).trim().toUpperCase()
    ) as ProviderName

    // Only register a provider that actually has a real API key — an empty
    // key would just fail at the provider's API anyway, and this keeps a
    // misconfigured/unfunded provider (e.g. AI_PROVIDER pointing at a paid
    // provider with no key set) from ever being selected over one that
    // actually works.
    if (config.providers.CLAUDE?.apiKey) {
      this.adapters.set(
        'CLAUDE',
        new ClaudeAdapter(config.providers.CLAUDE.apiKey, config.providers.CLAUDE.model),
      )
    }
    if (config.providers.OPENAI?.apiKey) {
      this.adapters.set(
        'OPENAI',
        new OpenAIAdapter(config.providers.OPENAI.apiKey, config.providers.OPENAI.model),
      )
    }
    if (config.providers.GEMINI?.apiKey) {
      this.adapters.set(
        'GEMINI',
        new GeminiAdapter(config.providers.GEMINI.apiKey, config.providers.GEMINI.model),
      )
    }
  }

  private getAdapter(provider?: ProviderName): AIAdapter {
    const name = provider ? (String(provider).trim().toUpperCase() as ProviderName) : this.defaultProvider
    const adapter = this.adapters.get(name)
    if (adapter) return adapter

    // Requested/default provider has no configured key — fall back to the
    // only one that's actually usable rather than hard-failing the whole
    // chat, as long as there's no ambiguity about which one to use.
    if (this.adapters.size === 1) {
      return this.adapters.values().next().value as AIAdapter
    }

    const configured = Array.from(this.adapters.keys()).join(', ') || 'none'
    throw new Error(`AI provider ${name} is not configured (configured: ${configured})`)
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
