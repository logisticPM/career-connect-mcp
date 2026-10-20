import type { Contact } from "./types";

export const REVEALABLE_FIELDS = ["email", "phone", "notes"] as const;
export type RevealField = (typeof REVEALABLE_FIELDS)[number];

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 2 ? "•••" : `•••${digits.slice(-2)}`;
}

export type PublicContact = Omit<Contact, "notes"> & { notes?: string; hasNotes: boolean };

/**
 * The shape of a contact as the model sees it. Tool results are sent to the
 * AI provider, so contact details stay masked unless a field is explicitly revealed.
 */
export function toPublicContact(contact: Contact, reveal: readonly RevealField[] = []): PublicContact {
  const { notes, email, phone, ...rest } = contact;
  return {
    ...rest,
    email: email && (reveal.includes("email") ? email : maskEmail(email)),
    phone: phone && (reveal.includes("phone") ? phone : maskPhone(phone)),
    notes: reveal.includes("notes") ? notes : undefined,
    hasNotes: Boolean(notes),
  };
}
