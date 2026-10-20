import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { resolveUserId, UnauthorizedError } from "@/lib/auth";
import { todayIn } from "@/lib/domain/dates";
import { REVEALABLE_FIELDS } from "@/lib/domain/mask";
import { CONTACT_STATUSES, CONTACT_TYPES, INTERACTION_KINDS, PRIORITIES } from "@/lib/domain/types";
import { getRepository } from "@/lib/store";
import * as h from "./handlers";
import { registerPrompts } from "./prompts";

interface RequestContext {
  http?: { authInfo?: AuthInfo };
}

async function depsFor(ctx: unknown): Promise<h.Deps> {
  const authInfo = (ctx as RequestContext | undefined)?.http?.authInfo;
  const repo = getRepository(authInfo);
  const userId = resolveUserId(authInfo);
  const settings = await repo.getSettings(userId);
  return { repo, userId, settings, today: todayIn(settings.timezone), appUrl: appUrl() };
}

const text = (t: string) => [{ type: "text" as const, text: t }];

/** Wraps a handler: resolves the caller, returns JSON text, and turns known errors into tool errors. */
function run<A>(fn: (d: h.Deps, args: A) => Promise<unknown>) {
  return async (args: A, ctx: unknown) => {
    try {
      const result = await fn(await depsFor(ctx), args);
      return { content: text(JSON.stringify(result, null, 2)) };
    } catch (err) {
      if (err instanceof h.UserError || err instanceof UnauthorizedError) {
        return { isError: true, content: text(err.message) };
      }
      console.error(err);
      return { isError: true, content: text("Something went wrong on the server. Try again.") };
    }
  };
}

// --- schemas -------------------------------------------------------------

// Every tool declares an input schema, even an empty one: without it the SDK
// calls the handler as (ctx) instead of (args, ctx), and run() would lose the
// caller's auth info.
const noArgs = z.object({});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const shortText = z.string().max(300);

const logSchema = z
  .object({
    kind: z.enum(INTERACTION_KINDS),
    date: isoDate.optional().describe("Defaults to today. A future meeting date marks it as scheduled."),
    note: z.string().max(1000).optional(),
  })
  .describe("Log an interaction at the same time, e.g. outreach sent or a meeting held.");

const contactFields = {
  title: shortText.optional(),
  company: shortText.optional(),
  industry: shortText.optional(),
  contactType: z.enum(CONTACT_TYPES).optional(),
  source: shortText.optional().describe("How you connected or who referred you"),
  email: z.email().optional(),
  phone: z.string().max(40).optional(),
  linkedinUrl: z.url().optional(),
  status: z.enum(CONTACT_STATUSES).optional().describe("Usually set automatically from logged interactions"),
  priority: z.enum(PRIORITIES).optional().describe("A = top 10, B = top 50, C = top 100"),
  goal: z.string().max(1000).optional().describe("What the user wants from conversations with this person"),
  nurtureIdeas: z.string().max(1000).optional(),
  notes: z.string().max(5000).optional(),
};

const profileSchema = z.object({
  background: z.string().max(1000).optional().describe("Previous role and industry"),
  location: shortText.optional(),
  program: shortText.optional(),
  strengths: z.string().max(2000).optional(),
  notWanted: z.string().max(2000).optional(),
  sellingPoints: z.string().max(2000).optional(),
  gaps: z.string().max(2000).optional(),
  targetRoles: z.array(shortText).max(20).optional().describe("Replaces the whole list"),
  targetIndustries: z.array(shortText).max(20).optional().describe("Replaces the whole list"),
  targetCompanies: z.array(shortText).max(50).optional().describe("Replaces the whole list"),
});

const addContactSchema = z.object({ name: z.string().min(1).max(200), ...contactFields, log: logSchema.optional() });
const updateContactSchema = z.object({
  contactId: z.string(),
  name: z.string().min(1).max(200).optional(),
  ...contactFields,
  log: logSchema.optional(),
});
const listContactsSchema = z.object({
  contactId: z.string().optional().describe("One contact, with full interaction history"),
  query: z.string().max(200).optional().describe("Matches name, company or title"),
  status: z.enum(CONTACT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  company: z.string().max(200).optional(),
  reveal: z
    .array(z.enum(REVEALABLE_FIELDS))
    .optional()
    .describe("Unmask these fields. Only when the user needs them, e.g. to address an email draft."),
});
const dueSchema = z.object({
  horizonDays: z.number().int().min(0).max(60).optional().describe("Also include items due in the next N days"),
});
const summarySchema = z.object({ month: z.string().optional().describe("YYYY-MM; defaults to this month") });
const deleteSchema = z.object({ contactId: z.string() });
const importSchema = z.object({
  connectionsCsv: z.string().max(2_000_000).describe("Full text of Connections.csv from LinkedIn's data export"),
  selected: z
    .array(z.number().int().min(0))
    .max(h.MAX_BULK)
    .optional()
    .describe("Row indexes to import. Omit to preview; nothing is saved without it."),
  offset: z.number().int().min(0).optional(),
  filter: z.string().max(200).optional(),
});

// --- registration --------------------------------------------------------

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerCareerConnect(server: McpServer) {
  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description: "The user's career profile: background, strengths, gaps, and target roles, industries and companies.",
      inputSchema: noArgs,
      annotations: READ,
    },
    run((d) => h.getProfile(d)),
  );

  server.registerTool(
    "update_profile",
    {
      title: "Update profile",
      description: "Update fields of the career profile. Only the fields given change.",
      inputSchema: profileSchema,
      annotations: { ...WRITE, idempotentHint: true },
    },
    run((d, args: z.infer<typeof profileSchema>) => h.updateProfile(d, args)),
  );

  server.registerTool(
    "add_contact",
    {
      title: "Add contact",
      description:
        "Add a networking contact. Optionally log an interaction at the same time; the status follows from it (outreach → Reached out, past meeting → Met, future meeting → Meeting scheduled).",
      inputSchema: addContactSchema,
      annotations: WRITE,
    },
    run((d, args: z.infer<typeof addContactSchema>) => h.addContact(d, args)),
  );

  server.registerTool(
    "update_contact",
    {
      title: "Update contact",
      description:
        "Change a contact's fields and/or log an interaction (outreach, follow_up, meeting, thank_you, reply_received, nurture). Status updates automatically from the interaction unless given.",
      inputSchema: updateContactSchema,
      annotations: WRITE,
    },
    run((d, args: z.infer<typeof updateContactSchema>) => h.updateContact(d, args)),
  );

  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description:
        "Find contacts by name, company, status or priority. Email, phone and notes are masked unless listed in `reveal`.",
      inputSchema: listContactsSchema,
      annotations: READ,
    },
    run((d, args: z.infer<typeof listContactsSchema>) => h.listContacts(d, args)),
  );

  server.registerTool(
    "list_due_followups",
    {
      title: "Follow-ups due",
      description:
        "Follow-ups due today or overdue: nudges after unanswered outreach, thank-you notes after meetings, and periodic check-ins with top contacts. Most overdue first.",
      inputSchema: dueSchema,
      annotations: READ,
    },
    run((d, args: z.infer<typeof dueSchema>) => h.listDueFollowUps(d, args.horizonDays)),
  );

  server.registerTool(
    "monthly_summary",
    {
      title: "Monthly summary",
      description: "Contacts reached, conversations held and conversion rate for a month, counted from logged dates.",
      inputSchema: summarySchema,
      annotations: READ,
    },
    run((d, args: z.infer<typeof summarySchema>) => h.getMonthlySummary(d, args.month)),
  );

  server.registerTool(
    "delete_contact",
    {
      title: "Delete contact",
      description: "Permanently delete one contact and its interaction history. Confirm with the user first.",
      inputSchema: deleteSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    run((d, args: z.infer<typeof deleteSchema>) => h.deleteContact(d, args.contactId)),
  );

  server.registerTool(
    "export_data",
    {
      title: "Export my data",
      description:
        "Give the user a link to download all of their data as JSON after signing in. The data itself is not returned in the chat.",
      inputSchema: noArgs,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    run((d) => h.exportData(d)),
  );

  server.registerTool(
    "import_linkedin_export",
    {
      title: "Import LinkedIn connections",
      description:
        "Import from Connections.csv in LinkedIn's 'Get a copy of your data' export. First call without `selected` to preview; then import only the rows the user picks (max 20 per call). Never overwrites fields the user already filled.",
      inputSchema: importSchema,
      annotations: WRITE,
    },
    run((d, args: z.infer<typeof importSchema>) => h.importLinkedInExport(d, args)),
  );

  registerPrompts(server, async (ctx) => {
    const d = await depsFor(ctx);
    return d.repo.getProfile(d.userId);
  });
}
