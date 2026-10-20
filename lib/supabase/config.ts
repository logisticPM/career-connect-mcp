export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  /** Issuer of Supabase Auth access tokens; also the OAuth authorization server URL. */
  issuer: string;
}

/** Supabase settings, or undefined when running on the in-memory store. */
export function supabaseConfig(): SupabaseConfig | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return undefined;
  const base = url.replace(/\/$/, "");
  return { url: base, publishableKey, issuer: `${base}/auth/v1` };
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = supabaseConfig();
  if (!config) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).");
  }
  return config;
}
