/** Calendar date in the user's timezone, formatted YYYY-MM-DD. */
export type IsoDate = string;

export const CONTACT_TYPES = [
  "Hiring manager",
  "HR or recruiter",
  "Alum",
  "Industry professional",
  "Mentor",
  "Former colleague",
  "Professor",
  "Peer or classmate",
  "Other",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_STATUSES = [
  "Not contacted",
  "Reached out",
  "Meeting scheduled",
  "Met",
  "Follow-up due",
  "Dormant",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const PRIORITIES = ["A", "B", "C"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INTERACTION_KINDS = [
  "outreach",
  "follow_up",
  "meeting",
  "thank_you",
  "reply_received",
  "nurture",
] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export interface Profile {
  /** Previous role and industry, e.g. "Logistics project manager, manufacturing". */
  background: string;
  location: string;
  program: string;
  strengths: string;
  notWanted: string;
  sellingPoints: string;
  gaps: string;
  targetRoles: string[];
  targetIndustries: string[];
  targetCompanies: string[];
}

export const EMPTY_PROFILE: Profile = {
  background: "",
  location: "",
  program: "",
  strengths: "",
  notWanted: "",
  sellingPoints: "",
  gaps: "",
  targetRoles: [],
  targetIndustries: [],
  targetCompanies: [],
};

export interface Contact {
  id: string;
  name: string;
  title?: string;
  company?: string;
  industry?: string;
  contactType?: ContactType;
  /** How we connected / who referred us. */
  source?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  status: ContactStatus;
  priority?: Priority;
  /** What the user wants to get out of conversations with this person. */
  goal?: string;
  nurtureIdeas?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewContact = Omit<Contact, "id" | "createdAt" | "updatedAt">;
export type ContactPatch = Partial<NewContact>;

export interface Interaction {
  id: string;
  contactId: string;
  kind: InteractionKind;
  date: IsoDate;
  note?: string;
  createdAt: string;
}

export type NewInteraction = Omit<Interaction, "id" | "createdAt">;

export interface FollowUpRules {
  /** Nudge this many days after outreach with no reply. */
  nudgeAfterDays: number;
  /** After a meeting, touch base again this often. */
  nurtureEveryDays: number;
  nurturePriorities: Priority[];
}

export interface UserSettings {
  timezone: string;
  rules: FollowUpRules;
}

export const DEFAULT_SETTINGS: UserSettings = {
  timezone: "America/Vancouver",
  rules: { nudgeAfterDays: 7, nurtureEveryDays: 30, nurturePriorities: ["A"] },
};

export interface AuditEntry {
  at: string;
  action: string;
  detail?: string;
}
