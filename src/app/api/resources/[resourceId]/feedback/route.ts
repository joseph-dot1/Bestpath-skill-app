import { NextResponse } from "next/server";
import { linkLessonResources } from "@/lib/curation/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// A resource with this many net downvotes across all learners is retired
// from the shared pool for everyone.
const RETIRE_NET_DOWNVOTES = 2;

/**
 * POST /api/resources/:resourceId/feedback
 * Body: { vote: 1 | -1, lessonId: string }
 * Records the vote in the shared-feedback flywheel. A downvote immediately
 * swaps the resource out of THIS learner's lesson; enough downvotes across
 * learners retire it from the pool entirely.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;

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

  let body: { vote?: unknown; lessonId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const vote = body.vote === 1 || body.vote === -1 ? body.vote : null;
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : null;
  if (!vote || !lessonId) {
    return NextResponse.json({ error: "vote (±1) and lessonId required" }, { status: 400 });
  }

  // Ownership: the lesson must be readable (RLS) and linked to this resource.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, topic_id, lesson_resources!inner ( resource_id )")
    .eq("id", lessonId)
    .eq("lesson_resources.resource_id", resourceId)
    .maybeSingle();
  if (!lesson || !lesson.topic_id) {
    return NextResponse.json({ error: "Lesson/resource not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  // --- Record the vote (idempotent per user+resource) -----------------------
  const { data: previous } = await supabase
    .from("resource_feedback")
    .select("vote")
    .eq("resource_id", resourceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: voteError } = await supabase
    .from("resource_feedback")
    .upsert(
      { user_id: user.id, resource_id: resourceId, vote },
      { onConflict: "user_id,resource_id" },
    );
  if (voteError) {
    console.error("vote upsert failed:", voteError);
    return NextResponse.json({ error: "Could not record vote" }, { status: 500 });
  }

  // --- Adjust shared counters ------------------------------------------------
  const prevVote = previous?.vote ?? 0;
  const upDelta = (vote === 1 ? 1 : 0) - (prevVote === 1 ? 1 : 0);
  const downDelta = (vote === -1 ? 1 : 0) - (prevVote === -1 ? 1 : 0);

  let up = 0;
  let down = 0;
  if (upDelta !== 0 || downDelta !== 0) {
    const { data: counters } = await admin.rpc("adjust_resource_votes", {
      rid: resourceId,
      up_delta: upDelta,
      down_delta: downDelta,
    });
    const row = Array.isArray(counters) ? counters[0] : counters;
    up = row?.up ?? 0;
    down = row?.down ?? 0;
  }

  // --- Downvote consequences --------------------------------------------------
  if (vote === -1) {
    // Retire from the shared pool once enough learners agree.
    if (down - up >= RETIRE_NET_DOWNVOTES) {
      await admin.from("resources").update({ status: "replaced" }).eq("id", resourceId);
    }
    // Always swap it out of THIS learner's lesson right away — excluding
    // everything they've ever downvoted in this topic so it can't come back.
    const { data: myDownvotes } = await supabase
      .from("resource_feedback")
      .select("resource_id, resources!inner ( topic_id )")
      .eq("user_id", user.id)
      .eq("vote", -1)
      .eq("resources.topic_id", lesson.topic_id);
    const excludeIds = [
      resourceId,
      ...(myDownvotes ?? []).map((d) => d.resource_id as string),
    ];
    await linkLessonResources(admin, lessonId, lesson.topic_id, excludeIds);
  }

  await supabase.from("events").insert({
    user_id: user.id,
    name: "resource_voted",
    props: { resource_id: resourceId, vote },
  });

  return NextResponse.json({ ok: true, replaced: vote === -1 });
}
