/**
 * The AI chat backend always asks the model to reply in a structured JSON
 * envelope (see apps/api/src/modules/ai/schemas/design-response.schema.ts):
 * { message, design_update, next_question, ai_justification }. That raw JSON
 * is what's stored as Message.content — this turns it back into the plain,
 * human-readable text a chat bubble should show, instead of a JSON blob.
 * Falls back to the raw content unchanged when it isn't parseable JSON in
 * that shape (e.g. a plain-text fallback reply, or any legacy message).
 */
export function parseAssistantMessage(rawContent: string): string {
  let json: unknown
  try {
    json = JSON.parse(rawContent)
  } catch {
    return rawContent
  }

  if (typeof json !== 'object' || json === null) return rawContent
  const { message, next_question: nextQuestion } = json as Record<string, unknown>
  if (typeof message !== 'string') return rawContent

  return typeof nextQuestion === 'string' && nextQuestion.trim()
    ? `${message}\n\n${nextQuestion}`
    : message
}

export interface AppliedRoomInfo {
  action: 'created' | 'updated'
  name: string
  area: number
  floor: number
}

/** Reads back the appliedRoom marker the API stores on Message.metadata when
 *  a chat turn's design_update actually created/updated a Room (see
 *  AiService.applyDesignUpdate) — lets the chat UI confirm the plan was
 *  really built, not just discussed. */
export function appliedRoomFromMetadata(metadata: unknown): AppliedRoomInfo | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const applied = (metadata as Record<string, unknown>).appliedRoom
  if (typeof applied !== 'object' || applied === null) return null
  const { action, name, area, floor } = applied as Record<string, unknown>
  if (
    (action !== 'created' && action !== 'updated') ||
    typeof name !== 'string' ||
    typeof area !== 'number' ||
    typeof floor !== 'number'
  ) {
    return null
  }
  return { action, name, area, floor }
}
