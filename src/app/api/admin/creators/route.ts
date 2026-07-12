import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

/** GET /api/admin/creators?skillId=… — the trusted-creator registry for a skill. */
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const skillId = new URL(request.url).searchParams.get("skillId");
  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const { data, error } = await guard.admin
    .from("skill_creators")
    .select("id, channel_name, youtube_channel_id, note, status, source, created_at")
    .eq("skill_id", skillId)
    .order("status") // approved, rejected, suggested — grouped for the UI
    .order("channel_name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ creators: data ?? [] });
}

/** POST /api/admin/creators — add a creator you trust (admin-sourced, pre-approved). */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  let body: { skillId?: unknown; channelName?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : "";
  const channelName =
    typeof body.channelName === "string" ? body.channelName.trim().slice(0, 100) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;
  if (!skillId || !channelName) {
    return NextResponse.json({ error: "skillId and channelName are required" }, { status: 400 });
  }

  const { data, error } = await guard.admin
    .from("skill_creators")
    .upsert(
      { skill_id: skillId, channel_name: channelName, note, status: "approved", source: "admin" },
      { onConflict: "skill_id,channel_name" },
    )
    .select("id, channel_name, youtube_channel_id, note, status, source, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ creator: data });
}
