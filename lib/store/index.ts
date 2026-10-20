import type { AuthInfo } from "@modelcontextprotocol/server";
import { UnauthorizedError } from "@/lib/auth";
import { createTokenClient } from "@/lib/supabase/clients";
import { supabaseConfig } from "@/lib/supabase/config";
import { MemoryRepository } from "./memory";
import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabase";

let memory: MemoryRepository | undefined;

/** The store for one MCP request: Supabase under the caller's token, or the dev memory store. */
export function getRepository(authInfo: AuthInfo | undefined): Repository {
  if (supabaseConfig()) {
    if (!authInfo?.token) throw new UnauthorizedError("Sign-in required.");
    return new SupabaseRepository(createTokenClient(authInfo.token));
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "true") {
    throw new Error(
      "No persistent store configured. Set the Supabase variables (see README), or ALLOW_MEMORY_STORE=true for a throwaway demo.",
    );
  }
  memory ??= new MemoryRepository();
  return memory;
}

export type { Repository };
