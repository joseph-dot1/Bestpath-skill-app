import "server-only";

import { generateStructured } from "@/lib/llm";

// A skill's market snapshot: what it pays, where demand is headed, how AI is
// changing it, and what's current. Framed for a Nigeria-first audience but
// with global/remote context too. Generated once per skill and cached.

export type MarketSnapshot = {
  pay_beginner: string;
  pay_experienced: string;
  demand_outlook: string;
  ai_impact: string;
  trends: string[];
};

const SCHEMA = {
  type: "object",
  properties: {
    pay_beginner: { type: "string" },
    pay_experienced: { type: "string" },
    demand_outlook: { type: "string" },
    ai_impact: { type: "string" },
    trends: { type: "array", items: { type: "string" } },
  },
  required: [
    "pay_beginner",
    "pay_experienced",
    "demand_outlook",
    "ai_impact",
    "trends",
  ],
  additionalProperties: false,
} as const;

export async function generateMarketSnapshot(
  skillTitle: string,
): Promise<MarketSnapshot> {
  const text = await generateStructured({
    tier: "fast",
    maxTokens: 1500,
    system: `You write a short, honest "market snapshot" for someone deciding whether to learn a skill. The primary audience is in Nigeria and often wants to earn income (a job or freelance), but many also work with international/remote clients. Be concrete and realistic — motivating but never hyped.

For the given skill, produce:
- "pay_beginner": what a beginner realistically earns once they can deliver basic paid work. Give BOTH a Nigerian range in Naira (use ₦ and "k"/"m", e.g. "₦80k–₦250k/month") AND a freelance/remote range in USD (e.g. "$5–$20/hour" or "$150–$500/project"). One or two sentences.
- "pay_experienced": what a skilled/experienced person earns, same dual format (Naira + USD).
- "demand_outlook": 1-2 sentences on how much demand there is for this skill right now and in the next few years — locally and remotely.
- "ai_impact": 2-3 sentences — honestly, how is AI changing this skill? Is it at risk of being replaced, or is it a tool that makes skilled people faster? What should a learner do to stay valuable as AI improves?
- "trends": 3-4 short bullet strings — current tools, platforms, or shifts worth knowing in this skill right now.

Rules:
- Numbers are realistic estimates, not guarantees — phrase pay as ranges.
- Keep each field tight and readable on a phone. No preamble, no markdown.
Output JSON only.`,
    schema: SCHEMA as unknown as Record<string, unknown>,
    user: `Skill: ${skillTitle}`,
  });

  const parsed = JSON.parse(text) as MarketSnapshot;
  return { ...parsed, trends: (parsed.trends ?? []).slice(0, 5) };
}
