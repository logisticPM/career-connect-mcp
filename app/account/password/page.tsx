import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createSessionClient } from "@/lib/supabase/clients";

async function setPassword(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect(`/account/password?failed=${encodeURIComponent(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)}`);
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  redirect(error ? `/account/password?failed=${encodeURIComponent(error.message)}` : "/account/password?done=1");
}

/** Lets an account created through an email link add a password. */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string; done?: string }>;
}) {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) redirect("/login?next=/account/password");

  const { failed, done } = await searchParams;
  return (
    <main>
      <h1>Set your password</h1>
      <p>Signed in as {String(data.claims.email ?? "")}.</p>
      {done ? (
        <p>Password saved. Next time, sign in with your email and this password.</p>
      ) : (
        <form action={setPassword}>
          <p>
            <label>
              New password (at least {MIN_PASSWORD_LENGTH} characters)
              <br />
              <input
                type="password"
                name="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                style={{ padding: 8, width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </p>
          <button type="submit" style={{ padding: "8px 16px" }}>
            Save password
          </button>
        </form>
      )}
      {failed && <p style={{ color: "#b00020" }}>{failed}</p>}
    </main>
  );
}
