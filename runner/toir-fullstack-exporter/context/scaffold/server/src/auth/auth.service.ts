import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

@Injectable()
export class AuthService {
  private remoteJwkSetPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;

  async getRemoteJwkSet() {
    if (!this.remoteJwkSetPromise) {
      this.remoteJwkSetPromise = this.createJwkSet();
    }
    return this.remoteJwkSetPromise;
  }

  private async createJwkSet() {
    const issuerUrl = process.env.KEYCLOAK_ISSUER_URL;
    const audience = process.env.KEYCLOAK_AUDIENCE;
    if (!issuerUrl) {
      throw new Error('KEYCLOAK_ISSUER_URL is not set');
    }
    if (!audience) {
      throw new Error('KEYCLOAK_AUDIENCE is not set');
    }

    // Note: backend auth validates JWTs and extracts realm_access roles
    // The JWT payload structure is expected to contain realm_access.roles

    // Strategy 1: explicit KEYCLOAK_JWKS_URL takes priority
    const explicitJwksUrl = process.env.KEYCLOAK_JWKS_URL;
    if (explicitJwksUrl) {
      try {
        return createRemoteJWKSet(new URL(explicitJwksUrl));
      } catch (error) {
        console.error(`Failed to initialize JWKS from explicit URL: ${explicitJwksUrl}`, error);
      }
    }

    // Strategy 2: try OIDC discovery at /.well-known/openid-configuration
    try {
      const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;
      const response = await fetch(discoveryUrl);
      if (response.ok) {
        const config = await response.json() as { jwks_uri?: string };
        if (config.jwks_uri) {
          return createRemoteJWKSet(new URL(config.jwks_uri));
        }
      }
    } catch (error) {
      console.warn(`OIDC discovery failed for ${issuerUrl}: ${(error as Error).message}`);
    }

    // Strategy 3: try Keycloak's hardcoded /protocol/openid-connect/certs endpoint
    try {
      const certsUrl = `${issuerUrl}/protocol/openid-connect/certs`;
      return createRemoteJWKSet(new URL(certsUrl));
    } catch (error) {
      throw new Error(
        `Could not initialize JWKS from any source (explicit: ${explicitJwksUrl ? 'tried' : 'none'}, discovery: tried, certs: failed). Last error: ${(error as Error).message}`,
      );
    }
  }
}
