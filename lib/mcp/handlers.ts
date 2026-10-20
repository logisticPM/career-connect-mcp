import { isIsoDate, monthOf } from "@/lib/domain/dates";
import { computeDueFollowUps } from "@/lib/domain/followups";
import { matchConnection, parseLinkedInConnections } from "@/lib/domain/linkedin";
import { toPublicContact, type RevealField } from "@/lib/domain/mask";
import { monthlySummary } from "@/lib/domain/summary";
import type {
  ContactPatch,
  ContactStatus,
  InteractionKind,
  IsoDate,
  NewContact,
  Priority,
  Profile,
  UserSettings,
} from "@/lib/domain/types";
import type { Repository } from "@/lib/store/repository";

/** Everything a tool needs for one call, resolved per request. */
export interface Deps {
  repo: Repository;
  userId: string;
  settings: UserSettings;
  today: IsoDate;
  appUrl: string;
}

/** An error whose message is safe to show the user and the model. */
export class UserError extends Error {}

export const MAX_BULK = 20;
const PREVIEW_PAGE = 50;

/** Drops keys whose value is undefined so a patch never blanks a field by omission. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface LogInput {
  kind: InteractionKind;
  /** Defaults to today. */
  date?: IsoDate;
  note?: string;
}

/** Status a logged interaction implies, or undefined to leave the status alone. */
function statusAfter(log: LogInput & { date: IsoDate }, today: IsoDate, current?: ContactStatus): ContactStatus | undefined {
  switch (log.kind) {
    case "outreach":
    case "follow_up":
      return !current || current === "Not contacted" || current === "Dormant" ? "Reached out" : undefined;
    case "meeting":
      return log.date > today ? "Meeting scheduled" : "Met";
    default:
      return undefined;
  }
}

function resolveLog(d: Deps, log?: LogInput) {
  if (!log) return undefined;
  const date = log.date ?? d.today;
  if (!isIsoDate(date)) throw new UserError(`Invalid date "${date}"; use YYYY-MM-DD.`);
  return { ...log, date };
}

// --- profile ---------------------------------------------------------------

export async function getProfile(d: Deps) {
  return d.repo.getProfile(d.userId);
}

export async function updateProfile(d: Deps, patch: Partial<Profile>) {
  const changes = defined(patch);
  const next = { ...(await d.repo.getProfile(d.userId)), ...changes };
  await d.repo.saveProfile(d.userId, next);
  await d.repo.appendAudit(d.userId, "update_profile", Object.keys(changes).join(", "));
  return next;
}

// --- contacts --------------------------------------------------------------

export type AddContactInput = Omit<NewContact, "status"> & { status?: ContactStatus; log?: LogInput };

export async function addContact(d: Deps, input: AddContactInput) {
  const { log: rawLog, ...fields } = input;
  const log = resolveLog(d, rawLog);
  const status = fields.status ?? (log && statusAfter(log, d.today)) ?? "Not contacted";
  const contact = await d.repo.insertContact(d.userId, { ...defined(fields), name: fields.name, status });
  const interaction = log && (await d.repo.addInteraction(d.userId, { contactId: contact.id, ...log }));
  await d.repo.appendAudit(d.userId, "add_contact", contact.id);
  return { contact: toPublicContact(contact), logged: interaction };
}

export type UpdateContactInput = ContactPatch & { contactId: string; log?: LogInput };

export async function updateContact(d: Deps, input: UpdateContactInput) {
  const { contactId, log: rawLog, ...fields } = input;
  const existing = await d.repo.getContact(d.userId, contactId);
  if (!existing) throw new UserError(`No contact with id ${contactId}. Use list_contacts to find it.`);

  const log = resolveLog(d, rawLog);
  const patch = defined(fields);
  if (!patch.status && log) {
    const implied = statusAfter(log, d.today, existing.status);
    if (implied) patch.status = implied;
  }
  const contact = Object.keys(patch).length
    ? await d.repo.updateContact(d.userId, contactId, patch)
    : existing;
  const interaction = log && (await d.repo.addInteraction(d.userId, { contactId, ...log }));
  await d.repo.appendAudit(d.userId, "update_contact", contactId);
  return { contact: toPublicContact(contact ?? existing), logged: interaction };
}

export interface ListContactsInput {
  contactId?: string;
  query?: string;
  status?: ContactStatus;
  priority?: Priority;
  company?: string;
  reveal?: RevealField[];
}

export async function listContacts(d: Deps, input: ListContactsInput) {
  const reveal = input.reveal ?? [];
  const q = input.query?.toLowerCase();
  const company = input.company?.toLowerCase();
  const [contacts, interactions] = await Promise.all([
    d.repo.listContacts(d.userId),
    d.repo.listInteractions(d.userId),
  ]);

  const matches = contacts.filter(
    (c) =>
      (!input.contactId || c.id === input.contactId) &&
      (!input.status || c.status === input.status) &&
      (!input.priority || c.priority === input.priority) &&
      (!company || c.company?.toLowerCase().includes(company)) &&
      (!q || [c.name, c.company, c.title].some((v) => v?.toLowerCase().includes(q))),
  );
  if (reveal.length > 0 && matches.length > 0) {
    await d.repo.appendAudit(d.userId, "reveal", `${reveal.join(", ")} for ${matches.length} contact(s)`);
  }

  return {
    count: matches.length,
    contacts: matches.map((c) => {
      const history = interactions.filter((i) => i.contactId === c.id).sort((a, b) => a.date.localeCompare(b.date));
      const last = history.at(-1);
      return {
        ...toPublicContact(c, reveal),
        lastInteraction: last && { kind: last.kind, date: last.date },
        // Full history only when asking about one contact, to keep results small.
        history: input.contactId ? history.map(({ kind, date, note }) => ({ kind, date, note })) : undefined,
      };
    }),
  };
}

export async function deleteContact(d: Deps, contactId: string) {
  const existing = await d.repo.getContact(d.userId, contactId);
  if (!existing) throw new UserError(`No contact with id ${contactId}.`);
  await d.repo.deleteContact(d.userId, contactId);
  await d.repo.appendAudit(d.userId, "delete_contact", contactId);
  return { deleted: existing.name };
}

// --- follow-ups and reporting ---------------------------------------------

export async function listDueFollowUps(d: Deps, horizonDays = 0) {
  const [contacts, interactions] = await Promise.all([
    d.repo.listContacts(d.userId),
    d.repo.listInteractions(d.userId),
  ]);
  const items = computeDueFollowUps(contacts, interactions, d.settings.rules, d.today, horizonDays);
  return { today: d.today, count: items.length, items };
}

export async function getMonthlySummary(d: Deps, month?: string) {
  const m = month ?? monthOf(d.today);
  if (!/^\d{4}-\d{2}$/.test(m)) throw new UserError(`Invalid month "${m}"; use YYYY-MM.`);
  const [contacts, interactions] = await Promise.all([
    d.repo.listContacts(d.userId),
    d.repo.listInteractions(d.userId),
  ]);
  return monthlySummary(contacts, interactions, m);
}

// --- data rights -------------------------------------------------------------

/**
 * The full export never passes through the chat. The user downloads it in a
 * browser after signing in, so no bearer link exists that could leak.
 */
export async function exportData(d: Deps) {
  await d.repo.appendAudit(d.userId, "export_link_shown");
  return {
    downloadUrl: `${d.appUrl}/export`,
    note: "Open the link in a browser and sign in with the same email to download all your data as JSON.",
  };
}

// --- LinkedIn import ------------------------------------------------------

export interface ImportLinkedInInput {
  connectionsCsv: string;
  /** Row indexes to import. Omit to preview without saving anything. */
  selected?: number[];
  /** Preview paging. */
  offset?: number;
  /** Preview filter on name, company or position. */
  filter?: string;
}

export async function importLinkedInExport(d: Deps, input: ImportLinkedInInput) {
  const rows = parseLinkedInConnections(input.connectionsCsv);
  const contacts = await d.repo.listContacts(d.userId);

  if (!input.selected) {
    const f = input.filter?.toLowerCase();
    const filtered = f
      ? rows.filter((r) => [r.name, r.company, r.position].some((v) => v?.toLowerCase().includes(f)))
      : rows;
    const offset = input.offset ?? 0;
    return {
      mode: "preview",
      totalRows: rows.length,
      matchingRows: filtered.length,
      offset,
      rows: filtered.slice(offset, offset + PREVIEW_PAGE).map((r) => ({
        index: r.index,
        name: r.name,
        company: r.company,
        position: r.position,
        connectedOn: r.connectedOn,
        hasEmail: Boolean(r.email),
        match: matchConnection(r, contacts).match,
      })),
      next: "Nothing is saved yet. Ask the user which rows to import, then call again with `selected`.",
    };
  }

  if (input.selected.length > MAX_BULK) {
    throw new UserError(`Import at most ${MAX_BULK} rows per call; ${input.selected.length} were selected.`);
  }

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: { index: number; reason: string }[] = [];
  for (const index of input.selected) {
    const row = rows.find((r) => r.index === index);
    if (!row) {
      skipped.push({ index, reason: "no such row" });
      continue;
    }
    const match = matchConnection(row, contacts);
    if (match.match === "name_only") {
      skipped.push({ index, reason: `uncertain match with an existing contact (${match.contactId}); update it directly` });
      continue;
    }
    const fromLinkedIn = {
      title: row.position,
      company: row.company,
      linkedinUrl: row.linkedinUrl,
      email: row.email,
    };
    if (match.match === "new") {
      await d.repo.insertContact(d.userId, {
        ...defined(fromLinkedIn),
        name: row.name,
        source: "LinkedIn connection",
        status: "Not contacted",
      });
      created.push(row.name);
    } else {
      // Fill blanks only; never overwrite what the user typed.
      const existing = contacts.find((c) => c.id === match.contactId)!;
      const fill = defined(
        Object.fromEntries(
          Object.entries(fromLinkedIn).filter(([k]) => existing[k as keyof typeof fromLinkedIn] === undefined),
        ),
      );
      if (Object.keys(fill).length) {
        await d.repo.updateContact(d.userId, existing.id, fill);
        updated.push(row.name);
      } else {
        skipped.push({ index, reason: "already up to date" });
      }
    }
  }
  await d.repo.appendAudit(
    d.userId,
    "import_linkedin_export",
    `created ${created.length}, updated ${updated.length}, skipped ${skipped.length}`,
  );
  return { mode: "import", created, updated, skipped };
}
