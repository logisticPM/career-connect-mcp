import { headers } from "next/headers";

export default async function Home() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const connectorUrl = `${proto}://${host}/api/mcp`;

  return (
    <main>
      <h1>Career Connect</h1>
      <p>
        A private networking CRM for your job search. Track contacts, get follow-up reminders and run career
        research prompts from inside Claude or ChatGPT.
      </p>
      <h2>Connect</h2>
      <p>Add this URL as a custom connector in Claude or ChatGPT:</p>
      <pre style={{ background: "#f4f4f4", padding: 12, overflowX: "auto" }}>{connectorUrl}</pre>
      <p style={{ color: "#666" }}>Beta. Do not store data you would not want a classmate-built tool to hold.</p>
    </main>
  );
}
