import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Protects admin/debug endpoints with a shared secret (x-internal-secret header
 * or Bearer token), independent of the user JWT. Ports requireInternalSecret
 * from the edge functions.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const provided =
      req.headers['x-internal-secret'] ??
      (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
    const secret = this.config.get<string>('ADMIN_API_SECRET');
    if (!secret || provided !== secret) {
      throw new UnauthorizedException('admin_unauthorized');
    }
    return true;
  }
}
