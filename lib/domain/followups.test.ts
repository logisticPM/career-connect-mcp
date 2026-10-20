import { describe, expect, it } from "vitest";
import { computeDueFollowUps } from "./followups";
import { DEFAULT_SETTINGS, type Contact, type Interaction, type InteractionKind } from "./types";

const rules = DEFAULT_SETTINGS.rules;
const TODAY = "2026-10-20";

function contact(id: string, extra: Partial<Contact> = {}): Contact {
  return { id, name: `Person ${id}`, status: "Reached out", createdAt: "2026-10-01T00:00:00Z", updatedAt: "", ...extra };
}
let n = 0;
function log(contactId: string, kind: InteractionKind, date: string): Interaction {
  return { id: String(n++), contactId, kind, date, createdAt: "" };
}

describe("computeDueFollowUps", () => {
  it("nudges 7 days after outreach with no reply", () => {
    const due = computeDueFollowUps([contact("a")], [log("a", "outreach", "2026-10-10")], rules, TODAY);
    expect(due).toMatchObject([{ contactId: "a", kind: "nudge", dueDate: "2026-10-17", daysOverdue: 3 }]);
  });

  it("does not nudge before the 7 days are up, unless inside the horizon", () => {
    const interactions = [log("a", "outreach", "2026-10-18")];
    expect(computeDueFollowUps([contact("a")], interactions, rules, TODAY)).toEqual([]);
    expect(computeDueFollowUps([contact("a")], interactions, rules, TODAY, 5)).toMatchObject([
      { kind: "nudge", dueDate: "2026-10-25", daysOverdue: -5 },
    ]);
  });

  it("clears the nudge once they reply, and restarts it after a new follow-up", () => {
    const replied = [log("a", "outreach", "2026-10-01"), log("a", "reply_received", "2026-10-03")];
    expect(computeDueFollowUps([contact("a")], replied, rules, TODAY)).toEqual([]);

    const followedUp = [...replied, log("a", "follow_up", "2026-10-05")];
    expect(computeDueFollowUps([contact("a")], followedUp, rules, TODAY)).toMatchObject([
      { kind: "nudge", dueDate: "2026-10-12" },
    ]);
  });

  it("asks for a thank-you after a past meeting, not before a future one", () => {
    const past = [log("a", "outreach", "2026-10-01"), log("a", "meeting", "2026-10-09")];
    expect(computeDueFollowUps([contact("a")], past, rules, TODAY)).toMatchObject([
      { kind: "thank_you", dueDate: "2026-10-09", daysOverdue: 11 },
    ]);

    const future = [log("a", "outreach", "2026-10-01"), log("a", "meeting", "2026-10-25")];
    expect(computeDueFollowUps([contact("a")], future, rules, TODAY)).toEqual([]);
  });

  it("schedules a nurture touch for A contacts 30 days after the last touch", () => {
    const history = [
      log("a", "meeting", "2026-09-01"),
      log("a", "thank_you", "2026-09-02"),
      log("b", "meeting", "2026-09-01"),
      log("b", "thank_you", "2026-09-02"),
    ];
    const due = computeDueFollowUps(
      [contact("a", { priority: "A", nurtureIdeas: "Share a product analytics article" }), contact("b", { priority: "B" })],
      history,
      rules,
      TODAY,
    );
    expect(due).toMatchObject([
      { contactId: "a", kind: "nurture", dueDate: "2026-10-02", suggestion: "Share a product analytics article" },
    ]);
  });

  it("skips dormant contacts", () => {
    const due = computeDueFollowUps(
      [contact("a", { status: "Dormant" })],
      [log("a", "outreach", "2026-09-01")],
      rules,
      TODAY,
    );
    expect(due).toEqual([]);
  });

  it("sorts most overdue first, then by priority", () => {
    const due = computeDueFollowUps(
      [contact("a", { priority: "C" }), contact("b", { priority: "A" }), contact("c")],
      [log("a", "outreach", "2026-10-01"), log("b", "outreach", "2026-10-01"), log("c", "outreach", "2026-09-20")],
      rules,
      TODAY,
    );
    expect(due.map((d) => d.contactId)).toEqual(["c", "b", "a"]);
  });
});
