import "server-only";

import { getAnthropic, MODELS } from "@/lib/anthropic";
import type { QuizQuestion } from "./types";

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct_index", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export async function generateQuiz(input: {
  skillTitle: string;
  moduleTitle: string;
  objectives: string[];
  lessons: { title: string; summary: string | null }[];
}): Promise<QuizQuestion[]> {
  const response = await getAnthropic().messages.create({
    model: MODELS.fast,
    max_tokens: 2048,
    system: `You write end-of-module quizzes for a skill-learning app. Produce 3-5 multiple-choice questions.

Rules:
- Active recall of the module's objectives — test what the learner can DO or decide, not trivia or definitions for their own sake.
- Scenario-flavored where possible ("A client asks you to… what do you do first?").
- Exactly 4 options per question; one clearly correct; distractors are plausible mistakes a beginner actually makes.
- Vary correct_index across questions (0-3).
- "explanation": one or two sentences on why the right answer is right — shown after the learner answers.
Output JSON only.`,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          skill: input.skillTitle,
          module: input.moduleTitle,
          objectives: input.objectives,
          lessons: input.lessons,
        }),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`Quiz generation returned no text (${response.stop_reason})`);
  const { questions } = JSON.parse(text) as { questions: QuizQuestion[] };

  // Guard the shape the UI depends on.
  return questions
    .filter(
      (q) =>
        q.options.length === 4 &&
        q.correct_index >= 0 &&
        q.correct_index < 4,
    )
    .slice(0, 5);
}
