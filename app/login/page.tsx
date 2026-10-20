import Link from "next/link";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/safe-next";
import { createSessionClient } from "@/lib/supabase/clients";

async function signIn(formData: FormData) {
  "use server";
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect(`/login?failed=${encodeURIComponent("Wrong email or password.")}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

/** Fallback for accounts without a password. Limited by Supabase's email quota. */
async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  const status = error ? `error=${encodeURIComponent(error.message)}` : "sent=1";
  redirect(`/login?${status}&next=${encodeURIComponent(next)}`);
}

const field = { padding: 8, width: "100%", boxSizing: "border-box" as const };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string; failed?: string }>;
}) {
  const { next: rawNext, sent, error, failed } = await searchParams;
  const next = safeNext(rawNext);
  return (
    <main>
      <h1>Sign in to Career Connect</h1>
      {failed && <p style={{ color: "#b00020" }}>Sign-in did not complete: {failed}</p>}
      <form action={signIn}>
        <input type="hidden" name="next" value={next} />
        <p>
          <label>
            Email
            <br />
            <input type="email" name="email" required autoComplete="email" style={field} />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input type="password" name="password" required autoComplete="current-password" style={field} />
          </label>
        </p>
        <button type="submit" style={{ padding: "8px 16px" }}>
          Sign in
        </button>
      </form>
      <p>
        New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account with your invite code</Link>.
      </p>

      <details style={{ marginTop: 32 }}>
        <summary>No password yet? Email me a sign-in link</summary>
        {sent ? (
          <p>Check your email. Open the link in this same browser.</p>
        ) : (
          <form action={sendLink}>
            <input type="hidden" name="next" value={next} />
            <p>
              <input type="email" name="email" required autoComplete="email" placeholder="Email" style={field} />
            </p>
            <button type="submit" style={{ padding: "8px 16px" }}>
              Email me a link
            </button>
          </form>
        )}
        {error && <p style={{ color: "#b00020" }}>Could not send the link: {error}</p>}
      </details>
    </main>
  );
}
