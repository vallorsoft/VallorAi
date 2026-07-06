export type AIProvider = 'CLAUDE' | 'OPENAI' | 'GEMINI' | 'DEEPSEEK' | 'MISTRAL' | 'LLAMA' | 'LOCAL'

export type AIMessageRole = 'system' | 'user' | 'assistant'

export interface AIMessage {
  role: AIMessageRole
  content: string
}

export interface AICompletionRequest {
  provider?: AIProvider
  messages: AIMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface AICompletionResponse {
  content: string
  provider: AIProvider
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ConversationMessage {
  id: string
  projectId: string
  role: AIMessageRole
  content: string
  metadata?: {
    designAction?: string
    roomsAffected?: string[]
    costDelta?: number
  }
  createdAt: Date
}

export type InterviewStep =
  | 'WELCOME'
  | 'PLOT_INFO'
  | 'LIFESTYLE'
  | 'FAMILY'
  | 'BUDGET'
  | 'ROOMS'
  | 'STYLE'
  | 'ENERGY'
  | 'GENERATING'
  | 'REVIEW'

export interface InterviewState {
  step: InterviewStep
  completedSteps: InterviewStep[]
  answers: Record<string, unknown>
}
