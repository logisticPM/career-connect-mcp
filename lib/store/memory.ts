import { randomBytes, randomUUID } from "node:crypto";
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

interface UserData {
  profile: Profile;
  settings: UserSettings;
  contacts: Map<string, Contact>;
  interactions: Interaction[];
  audit: AuditEntry[];
}

/** In-process store for development and tests. Data is lost on restart. */
export class MemoryRepository implements Repository {
  private users = new Map<string, UserData>();
  private exportTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(private now: () => Date = () => new Date()) {}

  private user(userId: string): UserData {
    let data = this.users.get(userId);
    if (!data) {
      data = {
        profile: structuredClone(EMPTY_PROFILE),
        settings: structuredClone(DEFAULT_SETTINGS),
        contacts: new Map(),
        interactions: [],
        audit: [],
      };
      this.users.set(userId, data);
    }
    return data;
  }

  async getProfile(userId: string) {
    return structuredClone(this.user(userId).profile);
  }

  async saveProfile(userId: string, profile: Profile) {
    this.user(userId).profile = structuredClone(profile);
  }

  async getSettings(userId: string) {
    return structuredClone(this.user(userId).settings);
  }

  async listContacts(userId: string) {
    return [...this.user(userId).contacts.values()].map((c) => structuredClone(c));
  }

  async getContact(userId: string, contactId: string) {
    const c = this.user(userId).contacts.get(contactId);
    return c && structuredClone(c);
  }

  async insertContact(userId: string, input: NewContact) {
    const at = this.now().toISOString();
    const contact: Contact = { ...structuredClone(input), id: randomUUID(), createdAt: at, updatedAt: at };
    this.user(userId).contacts.set(contact.id, contact);
    return structuredClone(contact);
  }

  async updateContact(userId: string, contactId: string, patch: ContactPatch) {
    const contacts = this.user(userId).contacts;
    const existing = contacts.get(contactId);
    if (!existing) return undefined;
    const updated: Contact = { ...existing, ...structuredClone(patch), updatedAt: this.now().toISOString() };
    contacts.set(contactId, updated);
    return structuredClone(updated);
  }

  async deleteContact(userId: string, contactId: string) {
    const data = this.user(userId);
    if (!data.contacts.delete(contactId)) return false;
    data.interactions = data.interactions.filter((i) => i.contactId !== contactId);
    return true;
  }

  async listInteractions(userId: string, contactId?: string) {
    return this.user(userId)
      .interactions.filter((i) => contactId === undefined || i.contactId === contactId)
      .map((i) => structuredClone(i));
  }

  async addInteraction(userId: string, input: NewInteraction) {
    const interaction: Interaction = { ...input, id: randomUUID(), createdAt: this.now().toISOString() };
    this.user(userId).interactions.push(interaction);
    return structuredClone(interaction);
  }

  async appendAudit(userId: string, action: string, detail?: string) {
    this.user(userId).audit.push({ at: this.now().toISOString(), action, detail });
  }

  async listAudit(userId: string) {
    return structuredClone(this.user(userId).audit);
  }

  async createExportToken(userId: string, ttlMs: number) {
    const token = randomBytes(24).toString("base64url");
    this.exportTokens.set(token, { userId, expiresAt: this.now().getTime() + ttlMs });
    return token;
  }

  async redeemExportToken(token: string) {
    const entry = this.exportTokens.get(token);
    this.exportTokens.delete(token);
    if (!entry || entry.expiresAt < this.now().getTime()) return undefined;
    return entry.userId;
  }
}
