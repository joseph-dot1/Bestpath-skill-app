import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

/** PATCH /api/admin/creators/:id — approve or reject a creator. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ creatorId: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { creatorId } = await params;
  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = body.status;
  if (status !== "approved" && status !== "rejected" && status !== "suggested") {
    return NextResponse.json({ error: "status must be approved | rejected | suggested" }, { status: 400 });
  }

  const { data, error } = await guard.admin
    .from("skill_creators")
    .update({ status })
    .eq("id", creatorId)
    .select("id, status")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ creator: data });
}

/** DELETE /api/admin/creators/:id — remove a creator entirely. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ creatorId: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { creatorId } = await params;
  const { error } = await guard.admin.from("skill_creators").delete().eq("id", creatorId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
