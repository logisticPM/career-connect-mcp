import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireSupabaseConfig } from "./config";

/**
 * Client acting as the browser user, from their session cookies. For pages,
 * server actions and route handlers (login, consent, export).
 */
export async function createSessionClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Client acting as the MCP caller, from their OAuth access token. Every query
 * runs under that user's row-level security; the server holds no key that
 * could read other users' data.
 */
export function createTokenClient(accessToken: string) {
  const { url, publishableKey } = requireSupabaseConfig();
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
