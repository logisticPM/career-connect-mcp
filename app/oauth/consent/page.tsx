import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/clients";

const SCOPE_TEXT: Record<string, string> = {
  openid: "Confirm who you are",
  email: "See your email address",
  profile: "See your basic profile",
  phone: "See your phone number",
  offline_access: "Stay connected until you revoke access",
};

async function decide(formData: FormData) {
  "use server";
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const supabase = await createSessionClient();
  const { data, error } =
    formData.get("decision") === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  }
  redirect(data.redirect_url);
}

/**
 * Supabase Auth sends the user here when Claude or ChatGPT asks to connect.
 * Nothing is granted until the signed-in user approves this specific client.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; failed?: string }>;
}) {
  const { authorization_id: authorizationId, failed } = await searchParams;
  if (!authorizationId) {
    return (
      <main>
        <h1>Missing request</h1>
        <p>Start the connection again from Claude or ChatGPT.</p>
      </main>
    );
  }

  const supabase = await createSessionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <main>
        <h1>This request has expired</h1>
        <p>Start the connection again from Claude or ChatGPT.</p>
      </main>
    );
  }
  // Already approved earlier: Supabase returns where to send the user next.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const scopes = data.scope.split(" ").filter(Boolean);
  return (
    <main>
      <h1>Connect {data.client.name} to Career Connect?</h1>
      <p>
        Signed in as <strong>{data.user.email}</strong>.
      </p>
      <p>
        If you approve, <strong>{data.client.name}</strong> can read and change your Career Connect profile,
        contacts and follow-ups when you ask it to. Contact emails, phone numbers and notes stay masked
        unless you ask for them.
      </p>
      {scopes.length > 0 && (
        <ul>
          {scopes.map((s) => (
            <li key={s}>{SCOPE_TEXT[s] ?? s}</li>
          ))}
        </ul>
      )}
      <p style={{ color: "#666" }}>
        It will return to <code>{data.redirect_uri}</code>. Only approve if you started this from Claude or ChatGPT
        just now.
      </p>
      {failed && <p style={{ color: "#b00020" }}>That did not go through. Try again.</p>}
      <form action={decide} style={{ display: "flex", gap: 12 }}>
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button type="submit" name="decision" value="approve" style={{ padding: "8px 16px" }}>
          Approve
        </button>
        <button type="submit" name="decision" value="deny" style={{ padding: "8px 16px" }}>
          Deny
        </button>
      </form>
    </main>
  );
}
