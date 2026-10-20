import { addDays, diffDays } from "./dates";
import type { Contact, FollowUpRules, Interaction, InteractionKind, IsoDate } from "./types";

export type FollowUpKind = "nudge" | "thank_you" | "nurture";

export interface DueFollowUp {
  contactId: string;
  name: string;
  company?: string;
  priority?: Contact["priority"];
  kind: FollowUpKind;
  dueDate: IsoDate;
  /** Positive when overdue, 0 when due today, negative when upcoming. */
  daysOverdue: number;
  suggestion: string;
}

const PRIORITY_RANK = { A: 0, B: 1, C: 2 } as const;

function latest(interactions: Interaction[], kinds: readonly InteractionKind[]): IsoDate | undefined {
  let best: IsoDate | undefined;
  for (const i of interactions) {
    if (kinds.includes(i.kind) && (best === undefined || i.date > best)) best = i.date;
  }
  return best;
}

/**
 * Follow-ups due on or before `today + horizonDays`.
 *
 * - nudge: outreach with no reply or meeting since, `nudgeAfterDays` later
 * - thank_you: a meeting that has happened with no thank-you on or after it
 * - nurture: priority contacts already met, `nurtureEveryDays` after the last touch
 */
export function computeDueFollowUps(
  contacts: Contact[],
  interactions: Interaction[],
  rules: FollowUpRules,
  today: IsoDate,
  horizonDays = 0,
): DueFollowUp[] {
  const cutoff = addDays(today, horizonDays);
  const byContact = new Map<string, Interaction[]>();
  for (const i of interactions) {
    const list = byContact.get(i.contactId) ?? [];
    list.push(i);
    byContact.set(i.contactId, list);
  }

  const due: DueFollowUp[] = [];
  for (const contact of contacts) {
    if (contact.status === "Dormant") continue;
    const mine = byContact.get(contact.id) ?? [];
    const push = (kind: FollowUpKind, dueDate: IsoDate, suggestion: string) => {
      if (dueDate > cutoff) return;
      due.push({
        contactId: contact.id,
        name: contact.name,
        company: contact.company,
        priority: contact.priority,
        kind,
        dueDate,
        daysOverdue: diffDays(today, dueDate),
        suggestion,
      });
    };

    const lastOutreach = latest(mine, ["outreach", "follow_up"]);
    const lastResponse = latest(mine, ["reply_received", "meeting"]);
    if (lastOutreach && (!lastResponse || lastResponse < lastOutreach)) {
      push(
        "nudge",
        addDays(lastOutreach, rules.nudgeAfterDays),
        `No reply since ${lastOutreach}. Send a short, friendly follow-up.`,
      );
    }

    const lastMeeting = latest(mine, ["meeting"]);
    if (lastMeeting && lastMeeting <= today) {
      const lastThanks = latest(mine, ["thank_you"]);
      if (!lastThanks || lastThanks < lastMeeting) {
        push(
          "thank_you",
          lastMeeting,
          "Send a thank-you that mentions one specific thing from the conversation.",
        );
      } else if (contact.priority && rules.nurturePriorities.includes(contact.priority)) {
        const lastTouch = latest(mine, ["outreach", "follow_up", "meeting", "thank_you", "nurture", "reply_received"]);
        push(
          "nurture",
          addDays(lastTouch ?? lastMeeting, rules.nurtureEveryDays),
          contact.nurtureIdeas || "Share an article, congratulate them on news, or send a short update.",
        );
      }
    }
  }

  return due.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      (a.priority ? PRIORITY_RANK[a.priority] : 3) - (b.priority ? PRIORITY_RANK[b.priority] : 3) ||
      a.name.localeCompare(b.name),
  );
}
