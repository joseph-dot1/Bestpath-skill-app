import { NextResponse } from "next/server";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { canAccessLevel, getUserTier } from "@/lib/entitlements";
import { generateQuiz } from "@/lib/learning/quiz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/modules/:moduleId/quiz
 * Returns the module's quiz, generating (and caching) it on first request.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await params;

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

  // Ownership + generation context in one RLS-scoped read.
  const { data: mod } = await supabase
    .from("modules")
    .select(
      `id, title, objectives,
       lessons ( title, summary ),
       levels ( is_free, roadmaps ( enrollments ( skills ( title ) ) ) )`,
    )
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const levelIsFree: boolean = (mod as any).levels?.is_free ?? false;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tier = await getUserTier(supabase, user.id);
  if (!canAccessLevel(tier, levelIsFree)) {
    return NextResponse.json({ error: "Upgrade to Pro to unlock this level." }, { status: 403 });
  }

  // Cached quiz? Return it.
  const { data: existing } = await supabase
    .from("quizzes")
    .select("id, questions")
    .eq("module_id", moduleId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ quizId: existing.id, questions: existing.questions });
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const skillTitle: string =
    (mod as any).levels?.roadmaps?.enrollments?.skills?.title ?? "the skill";
  /* eslint-enable @typescript-eslint/no-explicit-any */

  try {
    const questions = await generateQuiz({
      skillTitle,
      moduleTitle: mod.title,
      objectives: (mod.objectives as string[]) ?? [],
      lessons: (mod.lessons ?? []).map((l) => ({
        title: l.title,
        summary: l.summary,
      })),
    });

    const { data: quiz, error } = await admin
      .from("quizzes")
      .upsert({ module_id: moduleId, questions }, { onConflict: "module_id" })
      .select("id, questions")
      .single();
    if (error || !quiz) throw error ?? new Error("quiz insert failed");

    return NextResponse.json({ quizId: quiz.id, questions: quiz.questions });
  } catch (err) {
    console.error("quiz generation failed:", err);
    return NextResponse.json({ error: "Quiz generation failed — retry." }, { status: 500 });
  }
}
