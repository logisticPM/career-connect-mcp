import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { MemoryRepository } from "@/lib/store/memory";
import * as h from "./handlers";

let d: h.Deps;
beforeEach(() => {
  d = {
    repo: new MemoryRepository(() => new Date("2026-10-20T18:00:00Z")),
    userId: "u1",
    settings: DEFAULT_SETTINGS,
    today: "2026-10-20",
    appUrl: "https://cc.example",
  };
});

describe("contacts", () => {
  it("sets status from a logged interaction and masks the result", async () => {
    const { contact, logged } = await h.addContact(d, {
      name: "Sam Lee",
      company: "Acme",
      email: "samlee@example.com",
      log: { kind: "outreach", date: "2026-10-10" },
    });
    expect(contact).toMatchObject({ status: "Reached out", email: "s•••@example.com" });
    expect(logged).toMatchObject({ kind: "outreach", date: "2026-10-10" });

    const due = await h.listDueFollowUps(d);
    expect(due.items).toMatchObject([{ name: "Sam Lee", kind: "nudge", daysOverdue: 3 }]);
  });

  it("marks a future meeting as scheduled and a past one as met", async () => {
    const { contact } = await h.addContact(d, { name: "Ana" });
    const scheduled = await h.updateContact(d, { contactId: contact.id, log: { kind: "meeting", date: "2026-10-24" } });
    expect(scheduled.contact.status).toBe("Meeting scheduled");
    const met = await h.updateContact(d, { contactId: contact.id, log: { kind: "meeting", date: "2026-10-19" } });
    expect(met.contact.status).toBe("Met");
  });

  it("keeps an explicit status over the implied one", async () => {
    const { contact } = await h.addContact(d, { name: "Ana", status: "Dormant", log: { kind: "outreach" } });
    expect(contact.status).toBe("Dormant");
  });

  it("does not blank fields that are omitted from an update", async () => {
    const { contact } = await h.addContact(d, { name: "Ana", company: "Globex" });
    const { contact: updated } = await h.updateContact(d, { contactId: contact.id, title: "Director" });
    expect(updated).toMatchObject({ company: "Globex", title: "Director" });
  });

  it("rejects unknown contacts and bad dates with user-facing errors", async () => {
    await expect(h.updateContact(d, { contactId: "nope" })).rejects.toBeInstanceOf(h.UserError);
    await expect(h.addContact(d, { name: "Ana", log: { kind: "meeting", date: "2026-13-45" } })).rejects.toThrow(
      /Invalid date/,
    );
  });

  it("reveals masked fields only on request, and audits the reveal", async () => {
    await h.addContact(d, { name: "Sam Lee", email: "samlee@example.com", notes: "Likes hiking" });
    const masked = await h.listContacts(d, {});
    expect(masked.contacts[0]).toMatchObject({ email: "s•••@example.com", notes: undefined, hasNotes: true });

    const revealed = await h.listContacts(d, { reveal: ["email", "notes"] });
    expect(revealed.contacts[0]).toMatchObject({ email: "samlee@example.com", notes: "Likes hiking" });
    expect((await d.repo.listAudit("u1")).map((a) => a.action)).toContain("reveal");
  });

  it("deletes a contact with its history", async () => {
    const { contact } = await h.addContact(d, { name: "Ana", log: { kind: "outreach" } });
    expect(await h.deleteContact(d, contact.id)).toEqual({ deleted: "Ana" });
    expect(await d.repo.listInteractions("u1")).toEqual([]);
  });

  it("never shows one user's contacts to another", async () => {
    await h.addContact(d, { name: "Ana" });
    const other = await h.listContacts({ ...d, userId: "u2" }, {});
    expect(other.count).toBe(0);
  });
});

describe("export_data", () => {
  it("returns a sign-in download page instead of the data", async () => {
    await h.addContact(d, { name: "Sam Lee", email: "samlee@example.com" });
    const result = await h.exportData(d);
    expect(result.downloadUrl).toBe("https://cc.example/export");
    expect(JSON.stringify(result)).not.toContain("Sam Lee");
  });
});

describe("import_linkedin_export", () => {
  const csv = [
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Sam,Lee,https://www.linkedin.com/in/samlee,,Acme,Senior PM,15 Oct 2026",
    "Ana,Ruiz,https://www.linkedin.com/in/anaruiz,ana@example.com,Globex,Director,03 Jan 2025",
    "Kai,Chen,https://www.linkedin.com/in/kaichen,,Initech,Analyst,01 Feb 2026",
  ].join("\n");

  it("previews without saving and hides emails", async () => {
    const preview = await h.importLinkedInExport(d, { connectionsCsv: csv });
    expect(preview).toMatchObject({ mode: "preview", totalRows: 3 });
    expect(JSON.stringify(preview)).not.toContain("ana@example.com");
    expect(await d.repo.listContacts("u1")).toEqual([]);
  });

  it("imports only selected rows, fills blanks on matches, and skips uncertain matches", async () => {
    await h.addContact(d, { name: "Ana Ruiz", company: "Globex", title: "VP Strategy" });
    await h.addContact(d, { name: "Kai Chen", company: "Somewhere Else" });

    const result = await h.importLinkedInExport(d, { connectionsCsv: csv, selected: [0, 1, 2] });
    expect(result).toMatchObject({
      created: ["Sam Lee"],
      updated: ["Ana Ruiz"],
      skipped: [{ index: 2 }],
    });

    const ana = (await d.repo.listContacts("u1")).find((c) => c.name === "Ana Ruiz")!;
    expect(ana).toMatchObject({ title: "VP Strategy", linkedinUrl: "https://www.linkedin.com/in/anaruiz" });
  });

  it("caps a single import at 20 rows", async () => {
    const selected = Array.from({ length: 21 }, (_, i) => i);
    await expect(h.importLinkedInExport(d, { connectionsCsv: csv, selected })).rejects.toThrow(/at most 20/);
  });
});
