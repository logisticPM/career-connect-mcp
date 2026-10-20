import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier } from "./auth";

const ISSUER = "https://example.supabase.co/auth/v1";
const USER = "6f1c2a9e-0000-4000-8000-000000000001";

let verify: ReturnType<typeof createTokenVerifier>;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

async function sign(claims: JWTPayload, opts: { key?: CryptoKey; exp?: string; iss?: string } = {}) {
  return new SignJWT({ role: "authenticated", client_id: "claude-client", scope: "openid email", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setSubject(USER)
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" };
  verify = createTokenVerifier({ issuer: ISSUER, jwks: createLocalJWKSet({ keys: [jwk] }) });
});

describe("createTokenVerifier", () => {
  it("accepts a valid OAuth access token and exposes the user id", async () => {
    const token = await sign({});
    expect(await verify(token)).toMatchObject({
      token,
      clientId: "claude-client",
      scopes: ["openid", "email"],
      extra: { userId: USER },
    });
  });

  it("rejects a missing token", async () => {
    expect(await verify(undefined)).toBeUndefined();
  });

  it("rejects a token signed by another key", async () => {
    expect(await verify(await sign({}, { key: otherKey }))).toBeUndefined();
  });

  it("rejects a token from another project", async () => {
    expect(await verify(await sign({}, { iss: "https://other.supabase.co/auth/v1" }))).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    expect(await verify(await sign({}, { exp: "-1m" }))).toBeUndefined();
  });

  it("rejects a browser session token that was not issued through OAuth", async () => {
    expect(await verify(await sign({ client_id: undefined }))).toBeUndefined();
  });

  it("rejects symmetric (HS256) tokens", async () => {
    const hs = await new SignJWT({ client_id: "c" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough!!"));
    expect(await verify(hs)).toBeUndefined();
  });
});
