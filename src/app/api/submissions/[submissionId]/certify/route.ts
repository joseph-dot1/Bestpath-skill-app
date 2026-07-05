import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/submissions/:submissionId/certify
 * The learner self-certifies their checkpoint work — this, not an AI verdict,
 * is what advances them past a level.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;

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

  const { data, error } = await supabase
    .from("checkpoint_submissions")
    .update({ self_certified_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("user_id", user.id)
    .select("id, checkpoint_id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  await supabase.from("events").insert({
    user_id: user.id,
    name: "checkpoint_certified",
    props: { checkpoint_id: data.checkpoint_id },
  });

  return NextResponse.json({ ok: true });
}
