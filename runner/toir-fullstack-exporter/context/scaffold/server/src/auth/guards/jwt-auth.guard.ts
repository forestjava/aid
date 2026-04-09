import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { jwtVerify } from 'jose';
import { JwksService } from '../jwks.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        preferred_username?: string;
        name?: string;
        email?: string;
        realm_access?: {
          roles?: string[];
        };
      };
    }
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwksService: JwksService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if route is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('No bearer token provided');
    }

    try {
      const issuer = process.env.KEYCLOAK_ISSUER_URL;
      const audience = process.env.KEYCLOAK_AUDIENCE;

      if (!issuer || !audience) {
        throw new Error('KEYCLOAK_ISSUER_URL or KEYCLOAK_AUDIENCE not configured');
      }

      const jwkSet = await this.jwksService.getRemoteJwkSet();
      const verified = await jwtVerify(token, jwkSet, {
        issuer,
        audience,
      });

      request.user = {
        sub: verified.payload.sub as string,
        preferred_username: verified.payload.preferred_username as string | undefined,
        name: verified.payload.name as string | undefined,
        email: verified.payload.email as string | undefined,
        realm_access: verified.payload.realm_access as
          | { roles?: string[] }
          | undefined,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException(`JWT verification failed: ${(error as Error).message}`);
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}
