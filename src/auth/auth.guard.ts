import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/** Requires a valid `Authorization: Bearer <accessToken>` header. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(protected readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      return this.handleMissingToken();
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      request.user = { id: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return true;
  }

  protected handleMissingToken(): boolean {
    throw new UnauthorizedException('Missing access token');
  }
}

/**
 * For public routes whose answer depends on who is asking. Without a token the
 * request goes through anonymously; a token that is present must still be
 * valid, so the front finds out when a session has expired.
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard {
  protected override handleMissingToken(): boolean {
    return true;
  }
}
