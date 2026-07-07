import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { SKIP_ENVELOPE } from '../decorators/skip-envelope.decorator'

export interface ResponseEnvelope<T> {
  success: true
  data: T
  meta: Record<string, unknown>
}

/**
 * Wraps every successful controller response in a standard
 * `{ success, data, meta }` envelope.
 *
 * Routes marked with `@SkipEnvelope()` (e.g. the SSE stream endpoint,
 * which emits raw text chunks for an EventSource) are passed through
 * unwrapped.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ])

    if (skip) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data): ResponseEnvelope<unknown> => ({
        success: true,
        data: data ?? null,
        meta: {},
      })),
    )
  }
}
