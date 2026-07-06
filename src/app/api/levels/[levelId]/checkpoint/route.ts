import { NextResponse } from "next/server";
import { isLlmConfigured, LLM_NOT_CONFIGURED_MESSAGE } from "@/lib/llm";
import { canAccessLevel, getUserTier } from "@/lib/entitlements";
import { generateCheckpoint } from "@/lib/learning/checkpoint";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/levels/:levelId/checkpoint
 * Returns the level's "prove it" checkpoint, generating it on first request.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ levelId: string }> },
) {
  const { levelId } = await params;

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

  const { data: level } = await supabase
    .from("levels")
    .select(
      `id, name, is_free,
       modules ( title ),
       roadmaps ( enrollments ( goal, skills ( title ) ) )`,
    )
    .eq("id", levelId)
    .maybeSingle();
  if (!level) {
    return NextResponse.json({ error: "Level not found" }, { status: 404 });
  }

  const tier = await getUserTier(supabase, user.id);
  if (!canAccessLevel(tier, level.is_free)) {
    return NextResponse.json({ error: "Upgrade to Pro to unlock this level." }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("checkpoints")
    .select("id, brief, rubric")
    .eq("level_id", levelId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(existing);
  }

  if (!isLlmConfigured()) {
    return NextResponse.json({ error: LLM_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const enrollment = (level as any).roadmaps?.enrollments;
  const skillTitle: string = enrollment?.skills?.title ?? "the skill";
  const goal: string | null = enrollment?.goal ?? null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  try {
    const generated = await generateCheckpoint({
      skillTitle,
      levelName: level.name,
      moduleTitles: (level.modules ?? []).map((m) => m.title),
      goal,
    });

    const { data: checkpoint, error } = await admin
      .from("checkpoints")
      .upsert(
        { level_id: levelId, brief: generated.brief, rubric: generated.rubric },
        { onConflict: "level_id" },
      )
      .select("id, brief, rubric")
      .single();
    if (error || !checkpoint) throw error ?? new Error("checkpoint insert failed");

    return NextResponse.json(checkpoint);
  } catch (err) {
    console.error("checkpoint generation failed:", err);
    return NextResponse.json({ error: "Checkpoint generation failed — retry." }, { status: 500 });
  }
}
