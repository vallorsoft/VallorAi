import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'

/** Runs after AuthGuard('jwt') — reads req.user.role (set by JwtStrategy)
 * against the roles listed in @Roles(...) on the handler/class. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true

    const { user } = context.switchToHttp().getRequest<{ user?: { role?: string } }>()
    if (!user || !requiredRoles.includes(user.role ?? '')) {
      throw new ForbiddenException('Insufficient permissions')
    }
    return true
  }
}
