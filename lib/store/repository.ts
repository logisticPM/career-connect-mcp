import type {
  AuditEntry,
  Contact,
  ContactPatch,
  Interaction,
  NewContact,
  NewInteraction,
  Profile,
  UserSettings,
} from "@/lib/domain/types";

/**
 * Storage boundary. Every method is scoped to one user; implementations must
 * never return another user's rows. The memory store backs local development
 * and tests; the Supabase store backs production, where it queries with the
 * caller's own access token so row-level security enforces the scoping.
 */
export interface Repository {
  getProfile(userId: string): Promise<Profile>;
  saveProfile(userId: string, profile: Profile): Promise<void>;
  getSettings(userId: string): Promise<UserSettings>;

  listContacts(userId: string): Promise<Contact[]>;
  getContact(userId: string, contactId: string): Promise<Contact | undefined>;
  insertContact(userId: string, input: NewContact): Promise<Contact>;
  updateContact(userId: string, contactId: string, patch: ContactPatch): Promise<Contact | undefined>;
  /** Deletes the contact and its interactions. Returns false if it did not exist. */
  deleteContact(userId: string, contactId: string): Promise<boolean>;

  listInteractions(userId: string, contactId?: string): Promise<Interaction[]>;
  addInteraction(userId: string, input: NewInteraction): Promise<Interaction>;

  appendAudit(userId: string, action: string, detail?: string): Promise<void>;
  listAudit(userId: string): Promise<AuditEntry[]>;
}
