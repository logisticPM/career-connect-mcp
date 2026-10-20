import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createSessionClient } from "@/lib/supabase/clients";

/** Landing point of the emailed sign-in link: trades the code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent("That sign-in link is invalid or expired.")}`, url.origin),
  );
}
