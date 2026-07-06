import "server-only";

import { generateStructured } from "@/lib/llm";
import type { CheckpointFeedback } from "./types";

// ---------------------------------------------------------------------------
// "Prove it" checkpoints. Deliberately NOT an AI pass/fail gate: the AI can't
// verify claims about work it can't see, so it gives structured feedback
// against a rubric and the learner self-certifies to advance.
// ---------------------------------------------------------------------------

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    brief: { type: "string" },
    rubric: { type: "array", items: { type: "string" } },
  },
  required: ["brief", "rubric"],
  additionalProperties: false,
} as const;

export async function generateCheckpoint(input: {
  skillTitle: string;
  levelName: string;
  moduleTitles: string[];
  goal: string | null;
}): Promise<{ brief: string; rubric: string[] }> {
  const text = await generateStructured({
    tier: "reasoning",
    maxTokens: 1500,
    system: `You design "prove it" mini-projects that close out a level of a skill roadmap.

Rules for the brief (3-6 sentences):
- A single concrete project the learner can complete with free tools in a few hours, exercising this level's modules together.
- Realistic for the learner's goal (a freelance-goal learner builds something portfolio/client-shaped).
- Self-contained: no clients, teammates, or paid assets required.
Rules for the rubric (4-6 items):
- Each item is a checkable statement about the finished work ("The video has clean cuts with no dead air"), not a process step.
- Ordered from fundamentals to polish.
Output JSON only.`,
    schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
    user: JSON.stringify({
      skill: input.skillTitle,
      level: input.levelName,
      modules_completed: input.moduleTitles,
      learner_goal: input.goal,
    }),
  });

  return JSON.parse(text) as { brief: string; rubric: string[] };
}

const FEEDBACK_SCHEMA = {
  type: "object",
  properties: {
    overall_feedback: { type: "string" },
    rubric_assessment: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          assessment: {
            type: "string",
            enum: ["met", "partial", "not_evident"],
          },
          note: { type: "string" },
        },
        required: ["criterion", "assessment", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["overall_feedback", "rubric_assessment"],
  additionalProperties: false,
} as const;

export async function reviewSubmission(input: {
  skillTitle: string;
  levelName: string;
  brief: string;
  rubric: string[];
  description: string;
  mediaUrl: string | null;
}): Promise<CheckpointFeedback> {
  const text = await generateStructured({
    tier: "reasoning",
    maxTokens: 2048,
    system: `You review a learner's description of their "prove it" project. You can only see their WORDS, not the work itself — so assess what their description evidences, honestly.

Rules:
- For each rubric criterion: "met" if the description clearly evidences it, "partial" if partly, "not_evident" if the description doesn't mention it (say so kindly — "you didn't mention X; if you did it, great, if not, here's why it matters").
- "note": one specific, actionable sentence per criterion.
- "overall_feedback": 3-6 sentences. Lead with what's genuinely strong, then the single highest-leverage improvement, then encouragement grounded in their goal. Warm but honest — never gushing, never harsh.
- Never claim to have watched/seen anything. Never issue a pass/fail verdict — the learner decides when they're ready.
Output JSON only.`,
    schema: FEEDBACK_SCHEMA as unknown as Record<string, unknown>,
    user: JSON.stringify({
      skill: input.skillTitle,
      level: input.levelName,
      project_brief: input.brief,
      rubric: input.rubric,
      learner_description: input.description,
      media_link_provided: Boolean(input.mediaUrl),
    }),
  });

  return JSON.parse(text) as CheckpointFeedback;
}
