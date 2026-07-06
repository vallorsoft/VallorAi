export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AICompletionOptions {
  messages: AIMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface AICompletionResult {
  content: string
  provider: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface AIAdapter {
  readonly provider: string
  readonly model: string
  complete(options: AICompletionOptions): Promise<AICompletionResult>
  stream(options: AICompletionOptions): AsyncIterable<string>
}
