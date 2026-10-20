import type { Contact, IsoDate } from "./types";

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface LinkedInConnection {
  /** Row number in the export, used to select rows to import. */
  index: number;
  name: string;
  company?: string;
  position?: string;
  linkedinUrl?: string;
  email?: string;
  connectedOn?: IsoDate;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "15 Oct 2026" → "2026-10-15"; undefined when the format is not recognized. */
function parseConnectedOn(value: string): IsoDate | undefined {
  const m = /^(\d{1,2}) ([A-Za-z]{3})\w* (\d{4})$/.exec(value.trim());
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (month === 0) return undefined;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * Parses Connections.csv from LinkedIn's "Get a copy of your data" export.
 * The file starts with a few "Notes:" lines before the header; columns are
 * looked up by header name so a reordered or partial export still works.
 */
export function parseLinkedInConnections(csv: string): LinkedInConnection[] {
  const rows = parseCsv(csv);
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim() === "First Name"));
  if (headerAt === -1) throw new Error('Not a LinkedIn Connections export: no "First Name" header found.');

  const header = rows[headerAt].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => {
    const i = col(name);
    const v = i === -1 ? "" : (r[i] ?? "").trim();
    return v === "" ? undefined : v;
  };

  return rows.slice(headerAt + 1).flatMap((r, n) => {
    const name = [get(r, "First Name"), get(r, "Last Name")].filter(Boolean).join(" ");
    if (!name) return [];
    const connectedOn = get(r, "Connected On");
    return [
      {
        index: n,
        name,
        company: get(r, "Company"),
        position: get(r, "Position"),
        linkedinUrl: get(r, "URL"),
        email: get(r, "Email Address"),
        connectedOn: connectedOn ? parseConnectedOn(connectedOn) : undefined,
      },
    ];
  });
}

const normalize = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export type MatchResult =
  | { match: "new" }
  | { match: "linkedin_url" | "name_and_company" | "name_only"; contactId: string };

/** Matches a connection to an existing contact. Name-only matches are uncertain and must be confirmed by the user. */
export function matchConnection(connection: LinkedInConnection, contacts: Contact[]): MatchResult {
  if (connection.linkedinUrl) {
    const url = normalize(connection.linkedinUrl).replace(/\/$/, "");
    const hit = contacts.find((c) => c.linkedinUrl && normalize(c.linkedinUrl).replace(/\/$/, "") === url);
    if (hit) return { match: "linkedin_url", contactId: hit.id };
  }
  const sameName = contacts.filter((c) => normalize(c.name) === normalize(connection.name));
  const withCompany = sameName.find(
    (c) => c.company && connection.company && normalize(c.company) === normalize(connection.company),
  );
  if (withCompany) return { match: "name_and_company", contactId: withCompany.id };
  if (sameName.length > 0) return { match: "name_only", contactId: sameName[0].id };
  return { match: "new" };
}
