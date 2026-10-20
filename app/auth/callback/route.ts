import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createSessionClient } from "@/lib/supabase/clients";

/** Landing point of the emailed sign-in link: trades the code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  let reason = url.searchParams.get("error_description") ?? "The link has no sign-in code.";
  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    reason =
      error.name === "AuthPKCECodeVerifierMissingError"
        ? "Open the link in the same browser where you asked for it."
        : error.message;
  }
  const back = new URL("/login", url.origin);
  back.searchParams.set("failed", reason);
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
