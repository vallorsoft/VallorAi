/** Thrown by an adapter when the provider's response indicates a rate-limit
 * or quota-exhaustion error, so callers can distinguish "try again later /
 * consider a different provider" from a genuine failure (bad request,
 * invalid model, auth error, etc). */
export class AIQuotaExceededError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message)
    this.name = 'AIQuotaExceededError'
  }
}

const QUOTA_ERROR_PATTERN = /\[429|rate.?limit|quota/i

export function isQuotaExceededMessage(message: string): boolean {
  return QUOTA_ERROR_PATTERN.test(message)
}
