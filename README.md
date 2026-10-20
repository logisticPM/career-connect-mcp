# Career Connect

A private networking CRM for job seekers, served as an MCP server so it works inside Claude and ChatGPT. It replaces a career-centre networking spreadsheet: profile, contact log, follow-up reminders, monthly funnel, and research prompts that fill themselves in from your profile.

Design doc: https://claude.ai/code/artifact/aa5c425a-519f-41d2-88cb-3e22cc6881d9

## Status

Phase 1 skeleton. All tools and prompts work against an **in-memory store** (data is lost on restart). Not yet wired: Supabase storage, OAuth sign-in, field encryption, reminders (cron digest, ICS feed).

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev        # MCP endpoint: http://localhost:3000/api/mcp
npm test
npm run typecheck
```

Try it with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

and connect to `http://localhost:3000/api/mcp` (Streamable HTTP). Claude and ChatGPT custom connectors need a public HTTPS URL, so test them after deploying to Vercel.

## What's inside

| Tool | Purpose |
| --- | --- |
| `get_profile` / `update_profile` | Background, strengths, gaps, target roles, industries, companies |
| `add_contact` / `update_contact` | Contact fields plus an optional logged interaction; status follows from it |
| `list_contacts` | Search; email, phone and notes masked unless `reveal` is passed (reveals are audited) |
| `list_due_followups` | Nudges after unanswered outreach, thank-yous after meetings, check-ins with A contacts |
| `monthly_summary` | Contacts reached, conversations, conversion rate from real dates |
| `delete_contact` | Hard delete with history (marked destructive) |
| `export_data` | One-time download link; the data never passes through the chat |
| `import_linkedin_export` | Preview, then import selected rows of LinkedIn's Connections.csv (max 20 per call) |

Prompts: `explore_industries`, `industry_deep_dive`, `explore_roles`, `role_deep_dive`, `build_company_list`, `company_deep_dive`, `test_assumptions`.

```
app/api/mcp/route.ts           MCP endpoint (mcp-handler, Streamable HTTP)
app/api/export/[token]/        one-time JSON export download
lib/domain/                    pure logic: follow-up rules, summary, masking, LinkedIn parsing
lib/mcp/handlers.ts            tool behaviour, tested without MCP
lib/mcp/server.ts, prompts.ts  schemas, annotations and registration
lib/store/                     Repository interface + in-memory implementation
lib/auth.ts                    caller identity (dev user until OAuth)
```

## Next steps (Phase 1)

1. Supabase repository: schema with `user_id` on every table and row-level security, Canada (Central) region.
2. OAuth: pick the provider, wrap the route with `withMcpAuth`, put the user id in `authInfo.extra.userId`.
3. Field encryption for email, phone and notes.
4. Deploy to Vercel and connect from Claude.
