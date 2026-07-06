import "server-only";

import { generateStructured } from "@/lib/llm";

// ---------------------------------------------------------------------------
// Types shared with the assessment UI (via the API route)
// ---------------------------------------------------------------------------
export type AssessmentTurn = {
  question: string;
  answer: string;
};

export type AssessmentQuestion = {
  text: string;
  options: string[]; // 0 options = free-text only
  allow_free_text: boolean;
};

export type LearnerProfile = {
  prior_level: "none" | "beginner" | "intermediate" | "advanced";
  weekly_hours: number;
  goal: "job" | "freelance" | "hobby" | "certification" | "other";
  goal_detail: string;
  format_pref: "video_heavy" | "balanced" | "reading_heavy" | "project_heavy";
  summary: string;
};

export type AssessmentStep =
  | { action: "ask"; question: AssessmentQuestion }
  | { action: "finish"; profile: LearnerProfile };

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 8;

// ---------------------------------------------------------------------------
// Prompt + output schema
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You run the onboarding assessment for Bestpath, an app that builds personalized skill-learning roadmaps (Beginner → Intermediate → Advanced → Professional). Most users are in Nigeria; many learn to earn income.

Your job: ask between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} adaptive questions to determine, in rough priority order:
1. Prior knowledge and hands-on experience with this specific skill (probe with concrete follow-ups — "have you ever done X?" beats self-ratings).
2. Weekly time budget in hours (realistic, not aspirational — nudge them to be honest).
3. End goal: get a job, earn freelance income, hobby, or certification — and any specifics (niche, timeline, target income).
4. Preferred learning format mix: video-heavy, balanced, reading-heavy, or project-heavy.

Rules:
- ONE question at a time. Short, friendly, plain English. No jargon.
- Adapt to previous answers: if they said "complete beginner", don't ask which advanced tools they use; if an answer already covered a later question, skip it.
- Prefer 3-5 tappable options (mobile users on limited data); allow free text when nuance matters.
- NEVER use learning-styles pseudoscience (visual/auditory/kinesthetic). Format preference is about practical media mix only.
- Finish as soon as you have all four dimensions with reasonable confidence (minimum ${MIN_QUESTIONS} questions asked). You MUST finish by question ${MAX_QUESTIONS}.
- When finishing, write "summary" as 2-4 sentences a curriculum designer would use to build this person's roadmap: what they know, gaps, hours/week, goal, format mix.`;

const OUTPUT_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        action: { const: "ask" },
        question: {
          type: "object",
          properties: {
            text: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" },
            },
            allow_free_text: { type: "boolean" },
          },
          required: ["text", "options", "allow_free_text"],
          additionalProperties: false,
        },
      },
      required: ["action", "question"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        action: { const: "finish" },
        profile: {
          type: "object",
          properties: {
            prior_level: {
              type: "string",
              enum: ["none", "beginner", "intermediate", "advanced"],
            },
            weekly_hours: { type: "integer" },
            goal: {
              type: "string",
              enum: ["job", "freelance", "hobby", "certification", "other"],
            },
            goal_detail: { type: "string" },
            format_pref: {
              type: "string",
              enum: ["video_heavy", "balanced", "reading_heavy", "project_heavy"],
            },
            summary: { type: "string" },
          },
          required: [
            "prior_level",
            "weekly_hours",
            "goal",
            "goal_detail",
            "format_pref",
            "summary",
          ],
          additionalProperties: false,
        },
      },
      required: ["action", "profile"],
      additionalProperties: false,
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// One assessment step: given the transcript so far, ask the next question or
// finish with a learner profile.
// ---------------------------------------------------------------------------
export async function runAssessmentStep(
  skillTitle: string,
  transcript: AssessmentTurn[],
): Promise<AssessmentStep> {
  const asked = transcript.length;
  const mustFinish = asked >= MAX_QUESTIONS;

  const userMessage = [
    `Skill the user wants to learn: ${skillTitle}`,
    `Questions asked so far: ${asked} of ${MAX_QUESTIONS} max.`,
    mustFinish
      ? "You have reached the question limit. You MUST finish now with your best-effort profile."
      : asked >= MIN_QUESTIONS
        ? "You may finish now if you are confident in all four dimensions."
        : "You must ask at least one more question.",
    "",
    "Transcript so far (empty means this is the first question):",
    JSON.stringify(transcript, null, 2),
  ].join("\n");

  const text = await generateStructured({
    tier: "reasoning",
    system: SYSTEM_PROMPT,
    user: userMessage,
    schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1024,
  });

  const step = JSON.parse(text) as AssessmentStep;

  // Belt and braces: the schema constrains shape, not the question budget.
  if (step.action === "ask" && mustFinish) {
    throw new Error("Model attempted to exceed the question limit.");
  }
  return step;
}
