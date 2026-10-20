import { describe, expect, it } from "vitest";
import { addDays, diffDays, todayIn } from "./dates";
import { matchConnection, parseCsv, parseLinkedInConnections } from "./linkedin";
import { maskEmail, maskPhone, toPublicContact } from "./mask";
import { monthlySummary } from "./summary";
import type { Contact, Interaction } from "./types";

describe("dates", () => {
  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(diffDays("2026-11-04", "2026-10-28")).toBe(7);
  });

  it("uses the user's timezone for today", () => {
    const lateEvening = new Date("2026-10-21T05:30:00Z"); // 22:30 on Oct 20 in Vancouver
    expect(todayIn("America/Vancouver", lateEvening)).toBe("2026-10-20");
    expect(todayIn("Asia/Shanghai", lateEvening)).toBe("2026-10-21");
  });
});

describe("mask", () => {
  const c: Contact = {
    id: "1",
    name: "Sam Lee",
    email: "samlee@example.com",
    phone: "+1 604 555 0142",
    notes: "Met at the alumni mixer",
    status: "Met",
    createdAt: "",
    updatedAt: "",
  };

  it("masks email, phone and notes by default", () => {
    expect(maskEmail("samlee@example.com")).toBe("s•••@example.com");
    expect(maskPhone("+1 604 555 0142")).toBe("•••42");
    expect(toPublicContact(c)).toMatchObject({ email: "s•••@example.com", phone: "•••42", notes: undefined, hasNotes: true });
  });

  it("reveals only the fields asked for", () => {
    expect(toPublicContact(c, ["email"])).toMatchObject({ email: "samlee@example.com", phone: "•••42", notes: undefined });
  });
});

describe("monthlySummary", () => {
  const i = (contactId: string, kind: Interaction["kind"], date: string): Interaction => ({
    id: `${contactId}${kind}${date}`,
    contactId,
    kind,
    date,
    createdAt: "",
  });

  it("counts reached contacts and conversations from real dates", () => {
    const interactions = [
      i("a", "outreach", "2026-10-02"),
      i("a", "meeting", "2026-10-09"),
      i("b", "outreach", "2026-10-05"),
      i("b", "outreach", "2026-10-12"),
      i("c", "outreach", "2026-10-07"),
      i("d", "outreach", "2026-09-28"),
      i("d", "meeting", "2026-10-03"),
    ];
    expect(monthlySummary([], interactions, "2026-10")).toMatchObject({
      contactsReached: 3,
      conversations: 1,
      conversionRate: 0.33,
      meetingsThisMonth: 2,
    });
  });

  it("returns a null rate when nobody was reached", () => {
    expect(monthlySummary([], [], "2026-10").conversionRate).toBeNull();
  });
});

describe("LinkedIn export", () => {
  const csv = [
    "Notes:",
    '"When exporting your connection data, you may notice that some of the email addresses are missing."',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    'Sam,Lee,https://www.linkedin.com/in/samlee,,"Acme, Inc.",Senior Product Manager,15 Oct 2026',
    "Ana,Ruiz,https://www.linkedin.com/in/anaruiz,ana@example.com,Globex,Director,03 Jan 2025",
  ].join("\r\n");

  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("skips the preamble and maps columns by header name", () => {
    expect(parseLinkedInConnections(csv)).toEqual([
      {
        index: 0,
        name: "Sam Lee",
        company: "Acme, Inc.",
        position: "Senior Product Manager",
        linkedinUrl: "https://www.linkedin.com/in/samlee",
        email: undefined,
        connectedOn: "2026-10-15",
      },
      {
        index: 1,
        name: "Ana Ruiz",
        company: "Globex",
        position: "Director",
        linkedinUrl: "https://www.linkedin.com/in/anaruiz",
        email: "ana@example.com",
        connectedOn: "2025-01-03",
      },
    ]);
  });

  it("rejects files that are not a Connections export", () => {
    expect(() => parseLinkedInConnections("Name,Company\nSam,Acme")).toThrow(/First Name/);
  });

  it("matches by URL first, then name and company, and flags name-only matches", () => {
    const [sam] = parseLinkedInConnections(csv);
    const base = { status: "Met" as const, createdAt: "", updatedAt: "" };
    expect(matchConnection(sam, [{ ...base, id: "1", name: "S. Lee", linkedinUrl: "https://www.linkedin.com/in/samlee/" }])).toEqual({
      match: "linkedin_url",
      contactId: "1",
    });
    expect(matchConnection(sam, [{ ...base, id: "2", name: "sam lee", company: "acme, inc." }])).toEqual({
      match: "name_and_company",
      contactId: "2",
    });
    expect(matchConnection(sam, [{ ...base, id: "3", name: "Sam Lee", company: "Other Co" }])).toEqual({
      match: "name_only",
      contactId: "3",
    });
    expect(matchConnection(sam, [])).toEqual({ match: "new" });
  });
});
