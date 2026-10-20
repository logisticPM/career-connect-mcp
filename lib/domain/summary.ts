import { monthOf } from "./dates";
import type { Contact, Interaction } from "./types";

export interface MonthlySummary {
  month: string;
  /** Distinct contacts with an outreach logged this month. */
  contactsReached: number;
  /** Of those, how many have a meeting on or after their first outreach this month. */
  conversations: number;
  /** conversations ÷ contactsReached, rounded to 2 places; null when nobody was reached. */
  conversionRate: number | null;
  meetingsThisMonth: number;
  newContacts: number;
}

/** Replaces the spreadsheet's Monthly dashboard, counted from real dates instead of typed-in numbers. */
export function monthlySummary(contacts: Contact[], interactions: Interaction[], month: string): MonthlySummary {
  const firstOutreach = new Map<string, string>();
  for (const i of interactions) {
    if (i.kind !== "outreach" || monthOf(i.date) !== month) continue;
    const seen = firstOutreach.get(i.contactId);
    if (!seen || i.date < seen) firstOutreach.set(i.contactId, i.date);
  }

  let conversations = 0;
  for (const [contactId, date] of firstOutreach) {
    if (interactions.some((i) => i.contactId === contactId && i.kind === "meeting" && i.date >= date)) {
      conversations++;
    }
  }

  const contactsReached = firstOutreach.size;
  return {
    month,
    contactsReached,
    conversations,
    conversionRate: contactsReached === 0 ? null : Math.round((conversations / contactsReached) * 100) / 100,
    meetingsThisMonth: interactions.filter((i) => i.kind === "meeting" && monthOf(i.date) === month).length,
    newContacts: contacts.filter((c) => monthOf(c.createdAt) === month).length,
  };
}
