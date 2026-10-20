import Link from "next/link";
import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { safeNext } from "@/lib/safe-next";
import { createSessionClient } from "@/lib/supabase/clients";

async function signUp(formData: FormData) {
  "use server";
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = (message: string) =>
    redirect(`/signup?failed=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) back(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);

  const supabase = await createSessionClient();
  // The invite code is checked by the "Before User Created" hook in the database.
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? "").trim(),
    password,
    options: { data: { invite_code: String(formData.get("invite_code") ?? "").trim() } },
  });
  if (error) back(error.message);
  if (!data.session) {
    back("Your account was created but needs email confirmation, which is off for the beta. Ask the organiser.");
  }

  // The code has done its job; don't keep it in the user's profile or tokens.
  await supabase.auth.updateUser({ data: { invite_code: null } });
  redirect(next);
}

const field = { padding: 8, width: "100%", boxSizing: "border-box" as const };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; failed?: string }>;
}) {
  const { next: rawNext, failed } = await searchParams;
  const next = safeNext(rawNext);
  return (
    <main>
      <h1>Create your Career Connect account</h1>
      <p>Career Connect is in a closed beta. You need the invite code shared with your class.</p>
      {failed && <p style={{ color: "#b00020" }}>{failed}</p>}
      <form action={signUp}>
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
            Password (at least {MIN_PASSWORD_LENGTH} characters)
            <br />
            <input
              type="password"
              name="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              style={field}
            />
          </label>
        </p>
        <p>
          <label>
            Invite code
            <br />
            <input type="text" name="invite_code" required autoComplete="off" style={field} />
          </label>
        </p>
        <button type="submit" style={{ padding: "8px 16px" }}>
          Create account
        </button>
      </form>
      <p>
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>.
      </p>
    </main>
  );
}
