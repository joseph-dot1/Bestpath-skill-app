import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/lessons/:lessonId/complete   Body: { completed: boolean }
 * Toggles a lesson completion. RLS: users can only complete lessons on
 * their own roadmaps (the insert requires the lesson to be readable).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;

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

  let body: { completed?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const completed = body.completed === true;

  // Ownership: the lesson must be visible through RLS.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (completed) {
    const { error } = await supabase
      .from("lesson_completions")
      .upsert(
        { user_id: user.id, lesson_id: lessonId },
        { onConflict: "user_id,lesson_id" },
      );
    if (error) {
      console.error("completion insert failed:", error);
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    await supabase.from("events").insert({
      user_id: user.id,
      name: "lesson_completed",
      props: { lesson_id: lessonId },
    });
  } else {
    await supabase
      .from("lesson_completions")
      .delete()
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId);
  }

  return NextResponse.json({ ok: true, completed });
}
