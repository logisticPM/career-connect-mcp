import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { supabaseTokenVerifier } from "@/lib/auth";
import { registerCareerConnect } from "@/lib/mcp/server";
import { supabaseConfig } from "@/lib/supabase/config";

const mcp = createMcpHandler(registerCareerConnect, {
  serverInfo: { name: "career-connect", version: "0.1.0" },
});

const supabase = supabaseConfig();
// Created once so the JWKS stays cached across requests.
const verify = supabase && supabaseTokenVerifier(supabase.issuer);

// With Supabase configured, every request needs a valid OAuth access token; a
// missing or bad one gets a 401 pointing clients at the protected resource
// metadata, which names Supabase Auth as the authorization server.
const handler = verify
  ? withMcpAuth(mcp, (_req, token) => verify(token), {
      required: true,
      resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
    })
  : mcp;

export { handler as GET, handler as POST };
