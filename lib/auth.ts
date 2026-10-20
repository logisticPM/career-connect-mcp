import type { AuthInfo } from "@modelcontextprotocol/server";

export class UnauthorizedError extends Error {}

/**
 * The end user behind an MCP request. Once OAuth is wired (withMcpAuth), the
 * token verifier puts the user id in authInfo.extra.userId. Until then, local
 * development acts as DEV_USER_ID and production refuses the call.
 */
export function resolveUserId(authInfo: AuthInfo | undefined): string {
  const fromToken = authInfo?.extra?.userId;
  if (typeof fromToken === "string" && fromToken !== "") return fromToken;
  if (process.env.NODE_ENV !== "production") return process.env.DEV_USER_ID || "dev-user";
  throw new UnauthorizedError("Sign-in required.");
}
