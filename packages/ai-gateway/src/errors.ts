/** Thrown by an adapter when the provider's response indicates a rate-limit,
 * quota-exhaustion, or transient overload error, so callers can distinguish
 * "try again later / consider a different provider" from a genuine failure
 * (bad request, invalid model, auth error, etc). Covers both a hard "you've
 * used your allocation" (429/quota) and a soft "we're overloaded right now"
 * (503/high demand) — from the caller's point of view both mean the same
 * thing: this provider isn't usable right now. */
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
const OVERLOAD_ERROR_PATTERN = /\[503|overloaded|high demand|currently unavailable/i

export function isQuotaExceededMessage(message: string): boolean {
  return QUOTA_ERROR_PATTERN.test(message)
}

/** Transient provider-side capacity errors (not ours to fix) that are worth
 * a short retry before giving up — the provider itself is usually signaling
 * this is momentary. */
export function isTransientOverloadMessage(message: string): boolean {
  return OVERLOAD_ERROR_PATTERN.test(message)
}

export async function retryOnOverload<T>(attempt: () => Promise<T>, delaysMs = [800, 1600]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (i >= delaysMs.length || !isTransientOverloadMessage(message)) throw err
      await new Promise((resolve) => setTimeout(resolve, delaysMs[i]))
    }
  }
}
