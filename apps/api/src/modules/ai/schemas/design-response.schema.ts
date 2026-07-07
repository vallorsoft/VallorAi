import { z } from 'zod'

/**
 * Wire contract produced by the AI when generating/updating a design, as
 * instructed by the system prompts in `../prompts/system.prompt.ts`.
 * Field names are part of the contract other code parses and must stay
 * exactly as-is regardless of the prompt's natural language.
 */
export const designResponseSchema = z.object({
  message: z.string(),
  design_update: z
    .object({
      action: z.string(),
      data: z.record(z.unknown()),
    })
    .nullable(),
  next_question: z.string(),
  ai_justification: z.string(),
})

export type DesignResponse = z.infer<typeof designResponseSchema>

export interface ParsedDesignResponse {
  success: boolean
  data?: DesignResponse
  error?: string
}

/**
 * Strips a single leading/trailing markdown code fence (```json ... ``` or
 * ``` ... ```) that models sometimes wrap their JSON output in despite being
 * instructed to respond with raw JSON. Leaves the input untouched if it isn't
 * fenced.
 */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

/**
 * Attempts to parse and validate raw LLM text as a DesignResponse.
 * Never throws: on any failure (invalid JSON or schema mismatch) it returns
 * `{ success: false, error }` so callers can degrade gracefully instead of
 * breaking the user-facing chat response.
 */
export function parseDesignResponse(raw: string): ParsedDesignResponse {
  const cleaned = stripCodeFences(raw)

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch (err) {
    return { success: false, error: `Invalid JSON: ${(err as Error).message}` }
  }

  const result = designResponseSchema.safeParse(json)
  if (!result.success) {
    const reason = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    return { success: false, error: `Schema validation failed: ${reason}` }
  }

  return { success: true, data: result.data }
}
