import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/safe-next";
import { createSessionClient } from "@/lib/supabase/clients";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  const status = error ? `error=${encodeURIComponent(error.message)}` : "sent=1";
  redirect(`/login?${status}&next=${encodeURIComponent(next)}`);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string; failed?: string }>;
}) {
  const { next, sent, error, failed } = await searchParams;
  return (
    <main>
      <h1>Sign in to Career Connect</h1>
      {sent ? (
        <p>Check your email for a sign-in link. You can close this tab after you click it.</p>
      ) : (
        <form action={sendLink}>
          <input type="hidden" name="next" value={safeNext(next)} />
          <label>
            Email
            <br />
            <input type="email" name="email" required autoComplete="email" style={{ padding: 8, width: "100%" }} />
          </label>
          <p>
            <button type="submit" style={{ padding: "8px 16px" }}>
              Email me a sign-in link
            </button>
          </p>
        </form>
      )}
      {error && <p style={{ color: "#b00020" }}>Could not send the link: {error}</p>}
      {failed && <p style={{ color: "#b00020" }}>Sign-in did not complete: {failed} Request a new link below.</p>}
    </main>
  );
}
