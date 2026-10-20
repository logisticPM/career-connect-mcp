import { MemoryRepository } from "./memory";
import type { Repository } from "./repository";

let repository: Repository | undefined;

export function getRepository(): Repository {
  if (!repository) {
    // TODO(phase 1): return a SupabaseRepository when SUPABASE_URL is set.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "true") {
      throw new Error(
        "No persistent store configured. Set up Supabase (see README), or set ALLOW_MEMORY_STORE=true for a throwaway demo.",
      );
    }
    repository = new MemoryRepository();
  }
  return repository;
}

export type { Repository };
