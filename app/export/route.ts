import { NextResponse } from "next/server";
import { SupabaseRepository } from "@/lib/store/supabase";
import { createSessionClient } from "@/lib/supabase/clients";
import { supabaseConfig } from "@/lib/supabase/config";

/** Downloads everything stored for the signed-in user, read under their own session. */
export async function GET(request: Request) {
  if (!supabaseConfig()) {
    return new Response("Export needs Supabase; the in-memory dev store has nothing to export.", { status: 501 });
  }
  const supabase = await createSessionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.redirect(new URL("/login?next=/export", request.url));

  const repo = new SupabaseRepository(supabase);
  const [profile, settings, contacts, interactions, audit] = await Promise.all([
    repo.getProfile(),
    repo.getSettings(),
    repo.listContacts(),
    repo.listInteractions(userId),
    repo.listAudit(),
  ]);
  await repo.appendAudit(userId, "export_downloaded");

  const body = JSON.stringify({ exportedAt: new Date().toISOString(), profile, settings, contacts, interactions, audit }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="career-connect-export.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
