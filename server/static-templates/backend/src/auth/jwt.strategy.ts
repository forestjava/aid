import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${process.env.KEYCLOAK_URL}/protocol/openid-connect/certs`,
      }),
      algorithms: ['RS256'],
      issuer: process.env.KEYCLOAK_URL,
    });
  }

  validate(payload: Record<string, unknown>) {
    return {
      userId: payload.sub,
      username: payload.preferred_username,
      roles: payload.realm_access?.['roles'] ?? [],
    };
  }
}
