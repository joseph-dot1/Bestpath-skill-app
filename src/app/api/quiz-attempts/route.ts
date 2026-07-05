import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/quiz-attempts   Body: { quizId, answers: number[], score: 0-1 }
 * Records a quiz attempt (RLS: quiz must be readable → owned).
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

  let body: { quizId?: unknown; answers?: unknown; score?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const quizId = typeof body.quizId === "string" ? body.quizId : null;
  const answers = Array.isArray(body.answers) ? body.answers : null;
  const score = typeof body.score === "number" ? body.score : null;
  if (!quizId || !answers || score === null || score < 0 || score > 1) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Ownership via RLS read.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const { error } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_id: quizId,
    answers,
    score: Math.round(score * 100) / 100,
  });
  if (error) {
    console.error("attempt insert failed:", error);
    return NextResponse.json({ error: "Could not save attempt" }, { status: 500 });
  }

  await supabase.from("events").insert({
    user_id: user.id,
    name: "quiz_completed",
    props: { quiz_id: quizId, score },
  });

  return NextResponse.json({ ok: true });
}
