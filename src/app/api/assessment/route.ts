import { NextResponse } from "next/server";
import {
  MAX_QUESTIONS,
  runAssessmentStep,
  type AssessmentTurn,
} from "@/lib/assessment/engine";
import { isLlmConfigured, llmErrorMessage, LLM_NOT_CONFIGURED_MESSAGE } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";

// Rate-limit backoff inside the LLM call can take ~15s; don't let the
// platform's default timeout kill the request mid-retry.
export const maxDuration = 60;

/**
 * POST /api/assessment
 * Body: { skillTitle: string, transcript: [{question, answer}] }
 * Returns the next adaptive question, or the finished learner profile.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!isLlmConfigured()) {
    return NextResponse.json(
      { error: LLM_NOT_CONFIGURED_MESSAGE },
      { status: 503 },
    );
  }

  let body: { skillTitle?: unknown; transcript?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const skillTitle = typeof body.skillTitle === "string" ? body.skillTitle.trim() : "";
  const transcript = Array.isArray(body.transcript)
    ? (body.transcript as AssessmentTurn[])
    : null;

  if (!skillTitle || skillTitle.length > 120 || !transcript) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    transcript.length > MAX_QUESTIONS ||
    !transcript.every(
      (t) =>
        typeof t?.question === "string" &&
        typeof t?.answer === "string" &&
        t.answer.length <= 1000,
    )
  ) {
    return NextResponse.json({ error: "Invalid transcript" }, { status: 400 });
  }

  try {
    const step = await runAssessmentStep(skillTitle, transcript);
    return NextResponse.json(step);
  } catch (err) {
    console.error("assessment step failed:", err);
    return NextResponse.json(
      {
        error: llmErrorMessage(
          err,
          "Something went wrong generating the next question. Please retry.",
        ),
      },
      { status: 503 },
    );
  }
}
