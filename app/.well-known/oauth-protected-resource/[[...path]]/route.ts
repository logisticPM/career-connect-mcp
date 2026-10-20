import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { requireSupabaseConfig } from "@/lib/supabase/config";

// RFC 9728 metadata. Served at /.well-known/oauth-protected-resource/api/mcp
// (resource = <origin>/api/mcp) and at the bare path for older clients.
export function GET(req: Request) {
  return protectedResourceHandler({ authServerUrls: [requireSupabaseConfig().issuer] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
