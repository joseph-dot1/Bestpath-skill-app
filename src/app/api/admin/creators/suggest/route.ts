import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { suggestCreators } from "@/lib/curation/ai";
import { isLlmConfigured, llmErrorMessage, LLM_NOT_CONFIGURED_MESSAGE } from "@/lib/llm";

/** POST /api/admin/creators/suggest — AI proposes respected educators for a
    skill; they land as 'suggested' for the admin to approve/reject. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  if (!isLlmConfigured()) {
    return NextResponse.json({ error: LLM_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  let body: { skillId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : "";
  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const { data: skill } = await guard.admin
    .from("skills")
    .select("title")
    .eq("id", skillId)
    .single();
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  try {
    const suggestions = await suggestCreators(skill.title);
    if (suggestions.length > 0) {
      await guard.admin.from("skill_creators").upsert(
        suggestions.map((c) => ({
          skill_id: skillId,
          channel_name: c.channel_name,
          note: c.note,
          status: "suggested",
          source: "ai",
        })),
        { onConflict: "skill_id,channel_name", ignoreDuplicates: true },
      );
    }
    return NextResponse.json({ suggested: suggestions.length });
  } catch (err) {
    console.error("creator suggestion failed:", err);
    return NextResponse.json(
      { error: llmErrorMessage(err, "Suggestion failed — please retry.") },
      { status: 503 },
    );
  }
}
