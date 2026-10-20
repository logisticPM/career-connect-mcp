import { getRepository } from "@/lib/store";

/** One-time download of everything stored for a user, reached via the link from the export_data tool. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repo = getRepository();
  const userId = await repo.redeemExportToken(token);
  if (!userId) {
    return new Response("This export link is invalid, expired or already used. Ask for a new one.", { status: 410 });
  }

  const [profile, contacts, interactions, audit] = await Promise.all([
    repo.getProfile(userId),
    repo.listContacts(userId),
    repo.listInteractions(userId),
    repo.listAudit(userId),
  ]);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), profile, contacts, interactions, audit },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="career-connect-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
