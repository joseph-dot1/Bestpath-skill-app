// Shared learning-loop types (importable from client components — no
// server-only code here).

export type QuizQuestion = {
  question: string;
  options: string[]; // exactly 4
  correct_index: number;
  explanation: string;
};

export type RubricAssessment = {
  criterion: string;
  assessment: "met" | "partial" | "not_evident";
  note: string;
};

export type CheckpointFeedback = {
  overall_feedback: string;
  rubric_assessment: RubricAssessment[];
};

export const QUIZ_PASS_THRESHOLD = 0.6;
