import { NextResponse } from "next/server";
import {
  MAX_QUESTIONS,
  runAssessmentStep,
  type AssessmentTurn,
} from "@/lib/assessment/engine";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";

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

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — add it to .env.local (see README)." },
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
      { error: "Something went wrong generating the next question. Please retry." },
      { status: 500 },
    );
  }
}
