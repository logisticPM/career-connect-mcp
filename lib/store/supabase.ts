import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SETTINGS,
  EMPTY_PROFILE,
  type AuditEntry,
  type Contact,
  type ContactPatch,
  type Interaction,
  type NewContact,
  type NewInteraction,
  type Profile,
  type UserSettings,
} from "@/lib/domain/types";
import type { Repository } from "./repository";

// Column names in the database, keyed by the Contact field they store.
const CONTACT_COLUMNS = {
  name: "name",
  title: "title",
  company: "company",
  industry: "industry",
  contactType: "contact_type",
  source: "source",
  email: "email",
  phone: "phone",
  linkedinUrl: "linkedin_url",
  status: "status",
  priority: "priority",
  goal: "goal",
  nurtureIdeas: "nurture_ideas",
  notes: "notes",
} as const satisfies Record<keyof NewContact, string>;

type Row = Record<string, unknown>;

export function contactToRow(input: ContactPatch): Row {
  const row: Row = {};
  for (const [field, column] of Object.entries(CONTACT_COLUMNS)) {
    const value = input[field as keyof NewContact];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

export function rowToContact(row: Row): Contact {
  const contact: Record<string, unknown> = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  for (const [field, column] of Object.entries(CONTACT_COLUMNS)) {
    if (row[column] !== null && row[column] !== undefined) contact[field] = row[column];
  }
  return contact as unknown as Contact;
}

function rowToInteraction(row: Row): Interaction {
  return {
    id: row.id as string,
    contactId: row.contact_id as string,
    kind: row.kind as Interaction["kind"],
    date: row.date as string,
    note: (row.note as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  return result.data;
}

/** For writes that must return the row they wrote (RLS can hide it). */
function written<T>(result: { data: T | null; error: { message: string } | null }): T {
  const data = check(result);
  if (data === null) throw new Error("Supabase: the write returned no row");
  return data;
}

/**
 * Repository over Supabase. The client carries the caller's access token, so
 * row-level security limits every query to their rows and fills user_id on
 * insert; `userId` arguments are not trusted for scoping here.
 */
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}

  async getProfile() {
    const data = check(await this.db.from("profiles").select("profile").maybeSingle());
    return { ...EMPTY_PROFILE, ...((data?.profile as Partial<Profile>) ?? {}) };
  }

  async saveProfile(userId: string, profile: Profile) {
    check(await this.db.from("profiles").upsert({ user_id: userId, profile }, { onConflict: "user_id" }));
  }

  async getSettings(): Promise<UserSettings> {
    const data = check(await this.db.from("profiles").select("settings").maybeSingle());
    const stored = (data?.settings ?? {}) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...stored, rules: { ...DEFAULT_SETTINGS.rules, ...stored.rules } };
  }

  async listContacts() {
    const rows = check(await this.db.from("contacts").select("*").order("created_at"));
    return (rows ?? []).map(rowToContact);
  }

  async getContact(_userId: string, contactId: string) {
    const row = check(await this.db.from("contacts").select("*").eq("id", contactId).maybeSingle());
    return row ? rowToContact(row) : undefined;
  }

  async insertContact(_userId: string, input: NewContact) {
    return rowToContact(written<Row>(await this.db.from("contacts").insert(contactToRow(input)).select().single()));
  }

  async updateContact(_userId: string, contactId: string, patch: ContactPatch) {
    const row = check(
      await this.db.from("contacts").update(contactToRow(patch)).eq("id", contactId).select().maybeSingle(),
    );
    return row ? rowToContact(row) : undefined;
  }

  async deleteContact(_userId: string, contactId: string) {
    const rows = check(await this.db.from("contacts").delete().eq("id", contactId).select("id"));
    return (rows ?? []).length > 0;
  }

  async listInteractions(_userId: string, contactId?: string) {
    let query = this.db.from("interactions").select("*").order("date");
    if (contactId) query = query.eq("contact_id", contactId);
    return (check(await query) ?? []).map(rowToInteraction);
  }

  async addInteraction(_userId: string, input: NewInteraction) {
    const row = written<Row>(
      await this.db
        .from("interactions")
        .insert({ contact_id: input.contactId, kind: input.kind, date: input.date, note: input.note })
        .select()
        .single(),
    );
    return rowToInteraction(row);
  }

  async appendAudit(_userId: string, action: string, detail?: string) {
    check(await this.db.from("audit_log").insert({ action, detail }));
  }

  async listAudit(): Promise<AuditEntry[]> {
    const rows = check(await this.db.from("audit_log").select("at, action, detail").order("at"));
    return (rows ?? []).map((r) => ({ at: r.at, action: r.action, detail: r.detail ?? undefined }));
  }
}
