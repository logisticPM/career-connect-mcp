import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Profile } from "@/lib/domain/types";

type LoadProfile = (ctx: unknown) => Promise<Profile>;

/** "About me" block built from the stored profile, so the user never re-types their background. */
export function aboutMe(p: Profile): string {
  const lines = [
    ["Program", p.program],
    ["Background", p.background],
    ["Location", p.location],
    ["Strengths", p.strengths],
    ["What I do not want", p.notWanted],
    ["What sets me apart", p.sellingPoints],
    ["Gaps I am working on", p.gaps],
    ["Target roles", p.targetRoles.join(", ")],
    ["Target industries", p.targetIndustries.join(", ")],
    ["Target companies", p.targetCompanies.join(", ")],
  ].filter(([, v]) => v);
  if (lines.length === 0) {
    return "About me: my profile is empty. Ask me for my background and strengths before answering, and offer to save them with update_profile.";
  }
  return ["About me:", ...lines.map(([k, v]) => `- ${k}: ${v}`)].join("\n");
}

const CHECK =
  "Mark anything you are unsure of, and tell me which facts I should verify on company sites, job postings or LinkedIn before relying on them.";

const where = (region?: string) => (region ? ` in ${region}` : "");

function message(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer, loadProfile: LoadProfile) {
  server.registerPrompt(
    "explore_industries",
    {
      title: "Industry: explore options",
      description: "Suggest industries that fit the user's profile.",
    },
    async (ctx) => {
      const p = await loadProfile(ctx);
      return message(
        `${aboutMe(p)}\n\nSuggest 8–10 industries where my background and strengths would be valued. For each, explain why it fits, what roles people like me usually start in, and one risk or downside. ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "industry_deep_dive",
    {
      title: "Industry: go deeper",
      description: "Overview of one industry: how it makes money, segments, employers, trends.",
      argsSchema: z.object({ industry: z.string(), region: z.string().optional() }),
    },
    async ({ industry, region }, ctx) => {
      const p = await loadProfile(ctx);
      return message(
        `${aboutMe(p)}\n\nGive me an overview of the ${industry} industry${where(region || p.location)}: how it makes money, its main segments and largest employers, the main trends and challenges of the last two years, and what employers there look for in someone with my background. ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "explore_roles",
    {
      title: "Role: explore options",
      description: "Roles the user could target in an industry.",
      argsSchema: z.object({ industry: z.string() }),
    },
    async ({ industry }, ctx) => {
      const p = await loadProfile(ctx);
      return message(
        `${aboutMe(p)}\n\nI am interested in ${industry}. Suggest 6–8 roles I could target. For each: the job titles it goes by, what the day-to-day looks like, which of my strengths it uses, and which of my gaps would matter most. ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "role_deep_dive",
    {
      title: "Role: go deeper",
      description: "What one role is really like and how to close the gaps for it.",
      argsSchema: z.object({ role: z.string(), industry: z.string().optional() }),
    },
    async ({ role, industry }, ctx) => {
      const p = await loadProfile(ctx);
      const inIndustry = industry ? ` in ${industry}` : "";
      return message(
        `${aboutMe(p)}\n\nI am considering a ${role} role${inIndustry}. Describe a typical week, the metrics it is measured on, the tools and skills it uses, and how people usually progress from it. Then compare it with my profile: what gaps would an interviewer see, and how could I close them in the next few months? ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "build_company_list",
    {
      title: "Company: build a list",
      description: "Organizations that hire for a role, to start outreach.",
      argsSchema: z.object({ role: z.string(), industry: z.string(), region: z.string().optional() }),
    },
    async ({ role, industry, region }, ctx) => {
      const p = await loadProfile(ctx);
      return message(
        `${aboutMe(p)}\n\nList 15–20 organizations${where(region || p.location)} that hire for ${role} roles in ${industry}. Mix large employers, mid-sized companies and startups, and include public-sector or nonprofit options where relevant. Give one line on each and say how confident you are that it hires for this role there. ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "company_deep_dive",
    {
      title: "Company: go deeper",
      description: "Brief on one company before outreach or an interview.",
      argsSchema: z.object({ company: z.string(), role: z.string().optional() }),
    },
    async ({ company, role }, ctx) => {
      const p = await loadProfile(ctx);
      const forRole = role ? ` because I am interested in a ${role} role there` : "";
      return message(
        `${aboutMe(p)}\n\nI am researching ${company}${forRole}. Summarize its business model, main products, recent news and strategic priorities, main competitors, and the challenges a new hire in that role would likely work on. End with three thoughtful questions I could ask someone who works there. ${CHECK}`,
      );
    },
  );

  server.registerPrompt(
    "test_assumptions",
    {
      title: "Test your assumptions",
      description: "A career coach's critique of the user's targets against their profile.",
    },
    async (ctx) => {
      const p = await loadProfile(ctx);
      return message(
        `${aboutMe(p)}\n\nActing as a direct, experienced career coach, test my targets against my profile. Which assumptions look weakest? Where are my gaps most likely to hurt me? What should I validate in my next five networking conversations, and what would change your view? ${CHECK}`,
      );
    },
  );
}
