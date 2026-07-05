import "server-only";

import { getAnthropic, MODELS } from "@/lib/anthropic";
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
  const response = await getAnthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 1500,
    system: `You design "prove it" mini-projects that close out a level of a skill roadmap.

Rules for the brief (3-6 sentences):
- A single concrete project the learner can complete with free tools in a few hours, exercising this level's modules together.
- Realistic for the learner's goal (a freelance-goal learner builds something portfolio/client-shaped).
- Self-contained: no clients, teammates, or paid assets required.
Rules for the rubric (4-6 items):
- Each item is a checkable statement about the finished work ("The video has clean cuts with no dead air"), not a process step.
- Ordered from fundamentals to polish.
Output JSON only.`,
    output_config: { format: { type: "json_schema", schema: BRIEF_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          skill: input.skillTitle,
          level: input.levelName,
          modules_completed: input.moduleTitles,
          learner_goal: input.goal,
        }),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`Checkpoint generation returned no text (${response.stop_reason})`);
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
  const response = await getAnthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 2048,
    system: `You review a learner's description of their "prove it" project. You can only see their WORDS, not the work itself — so assess what their description evidences, honestly.

Rules:
- For each rubric criterion: "met" if the description clearly evidences it, "partial" if partly, "not_evident" if the description doesn't mention it (say so kindly — "you didn't mention X; if you did it, great, if not, here's why it matters").
- "note": one specific, actionable sentence per criterion.
- "overall_feedback": 3-6 sentences. Lead with what's genuinely strong, then the single highest-leverage improvement, then encouragement grounded in their goal. Warm but honest — never gushing, never harsh.
- Never claim to have watched/seen anything. Never issue a pass/fail verdict — the learner decides when they're ready.
Output JSON only.`,
    output_config: { format: { type: "json_schema", schema: FEEDBACK_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          skill: input.skillTitle,
          level: input.levelName,
          project_brief: input.brief,
          rubric: input.rubric,
          learner_description: input.description,
          media_link_provided: Boolean(input.mediaUrl),
        }),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`Submission review returned no text (${response.stop_reason})`);
  return JSON.parse(text) as CheckpointFeedback;
}
