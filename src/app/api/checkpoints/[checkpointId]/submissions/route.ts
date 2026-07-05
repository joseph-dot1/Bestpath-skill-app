import { NextResponse } from "next/server";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { reviewSubmission } from "@/lib/learning/checkpoint";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/checkpoints/:checkpointId/submissions
 * Body: { description: string, mediaUrl?: string }
 * Stores the learner's project description and returns structured AI feedback
 * against the rubric. Advancing is self-certified — this is feedback, not a gate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ checkpointId: string }> },
) {
  const { checkpointId } = await params;

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

  let body: { description?: unknown; mediaUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const mediaUrl =
    typeof body.mediaUrl === "string" && body.mediaUrl.trim()
      ? body.mediaUrl.trim().slice(0, 500)
      : null;
  if (description.length < 30 || description.length > 5000) {
    return NextResponse.json(
      { error: "Describe what you built in at least a few sentences (30-5000 chars)." },
      { status: 400 },
    );
  }

  // Ownership + review context via RLS read.
  const { data: checkpoint } = await supabase
    .from("checkpoints")
    .select(
      `id, brief, rubric,
       levels ( name, roadmaps ( enrollments ( skills ( title ) ) ) )`,
    )
    .eq("id", checkpointId)
    .maybeSingle();
  if (!checkpoint) {
    return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const levelRel = (checkpoint as any).levels;
  const skillTitle: string =
    levelRel?.roadmaps?.enrollments?.skills?.title ?? "the skill";
  const levelName: string = levelRel?.name ?? "";
  /* eslint-enable @typescript-eslint/no-explicit-any */

  try {
    const feedback = await reviewSubmission({
      skillTitle,
      levelName,
      brief: checkpoint.brief,
      rubric: (checkpoint.rubric as string[]) ?? [],
      description,
      mediaUrl,
    });

    const { data: submission, error } = await supabase
      .from("checkpoint_submissions")
      .insert({
        user_id: user.id,
        checkpoint_id: checkpointId,
        description,
        media_url: mediaUrl,
        ai_feedback: JSON.stringify(feedback),
      })
      .select("id")
      .single();
    if (error || !submission) throw error ?? new Error("submission insert failed");

    await supabase.from("events").insert({
      user_id: user.id,
      name: "checkpoint_submitted",
      props: { checkpoint_id: checkpointId },
    });

    return NextResponse.json({ submissionId: submission.id, feedback });
  } catch (err) {
    console.error("submission review failed:", err);
    return NextResponse.json({ error: "Review failed — retry." }, { status: 500 });
  }
}
