import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { FastifyReply } from 'fastify'

interface ErrorEnvelope {
  success: false
  error: {
    code: string
    message: string
    details: unknown
  }
}

/**
 * Normalizes every `HttpException` into the standard
 * `{ success: false, error: { code, message, details } }` shape.
 *
 * `code` is derived pragmatically:
 *  - 400s (typically from the global ValidationPipe) -> VALIDATION_FAILED
 *  - 401s -> AUTH_EXPIRED when the underlying message indicates token expiry,
 *    otherwise AUTH_INVALID
 *  - everything else falls back to the HTTP status text (NOT_FOUND,
 *    FORBIDDEN, INTERNAL_ERROR, ...)
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const status = exception.getStatus()
    const body = exception.getResponse()

    const { message, details } = this.extractMessage(body)
    const code = this.deriveCode(status, message)

    const envelope: ErrorEnvelope = {
      success: false,
      error: { code, message, details },
    }

    reply.status(status).send(envelope)
  }

  private extractMessage(body: string | object): { message: string; details: unknown } {
    if (typeof body === 'string') {
      return { message: body, details: null }
    }

    const { message } = body as { message?: string | string[] }

    if (Array.isArray(message)) {
      return { message: 'Validation failed', details: message }
    }

    if (typeof message === 'string') {
      return { message, details: null }
    }

    return { message: 'Unexpected error', details: null }
  }

  private deriveCode(status: number, message: string): string {
    if (status === HttpStatus.BAD_REQUEST) {
      return 'VALIDATION_FAILED'
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return /expired/i.test(message) ? 'AUTH_EXPIRED' : 'AUTH_INVALID'
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'INTERNAL_ERROR'
    }

    // HttpStatus[status] already yields SCREAMING_SNAKE_CASE status text
    // (e.g. NOT_FOUND, FORBIDDEN, CONFLICT) for standard HTTP status codes.
    return HttpStatus[status] ?? 'INTERNAL_ERROR'
  }
}
