import { createMcpHandler } from "mcp-handler";
import { registerCareerConnect } from "@/lib/mcp/server";

// TODO(phase 1): wrap with withMcpAuth once the OAuth provider is chosen.
const handler = createMcpHandler(registerCareerConnect, {
  serverInfo: { name: "career-connect", version: "0.1.0" },
});

export { handler as GET, handler as POST };
