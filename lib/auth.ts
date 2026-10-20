import type { AuthInfo } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export class UnauthorizedError extends Error {}

/**
 * Verifies a Supabase Auth OAuth access token: signature against the project's
 * JWKS (asymmetric keys only), issuer, audience and expiry. Only tokens issued
 * through the OAuth flow (with a client_id) are accepted, so a browser session
 * token cannot be replayed against the MCP endpoint.
 */
export function createTokenVerifier({ issuer, jwks }: { issuer: string; jwks: JWTVerifyGetKey }) {
  return async (token: string | undefined): Promise<AuthInfo | undefined> => {
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
      });
      const clientId = payload.client_id;
      if (typeof payload.sub !== "string" || typeof clientId !== "string") return undefined;
      return {
        token,
        clientId,
        scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
        expiresAt: payload.exp,
        extra: { userId: payload.sub },
      };
    } catch {
      return undefined;
    }
  };
}

export function supabaseTokenVerifier(issuer: string) {
  return createTokenVerifier({ issuer, jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) });
}

/**
 * The end user behind an MCP request: the verified token's subject. Local
 * development without Supabase acts as DEV_USER_ID; production refuses.
 */
export function resolveUserId(authInfo: AuthInfo | undefined): string {
  const fromToken = authInfo?.extra?.userId;
  if (typeof fromToken === "string" && fromToken !== "") return fromToken;
  if (process.env.NODE_ENV !== "production") return process.env.DEV_USER_ID || "dev-user";
  throw new UnauthorizedError("Sign-in required.");
}
