import { NextResponse } from "next/server";
import { isLlmConfigured, llmDescription } from "@/lib/llm";
import { generateMarketSnapshot } from "@/lib/market/snapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Regenerate a snapshot at most this often, so cached data stays reasonably
// current without re-spending on every visit.
const STALE_AFTER_DAYS = 30;

/**
 * POST /api/skills/:skillId/market
 * Returns the skill's cached market snapshot, generating it on first request
 * (or when stale). Signed-in only so generation can't be triggered anonymously.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ skillId: string }> },
) {
  const { skillId } = await params;

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

  // Cached and fresh? Return it.
  const { data: existing } = await supabase
    .from("skill_market")
    .select("*")
    .eq("skill_id", skillId)
    .maybeSingle();

  if (
    existing &&
    Date.now() - new Date(existing.generated_at).getTime() <
      STALE_AFTER_DAYS * 864e5
  ) {
    return NextResponse.json(existing);
  }

  const { data: skill } = await supabase
    .from("skills")
    .select("title")
    .eq("id", skillId)
    .maybeSingle();
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  if (!isLlmConfigured()) {
    // No AI configured — return stale data if we have it, else 503.
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) {
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  try {
    const snapshot = await generateMarketSnapshot(skill.title);
    const { data: saved, error } = await admin
      .from("skill_market")
      .upsert(
        {
          skill_id: skillId,
          ...snapshot,
          model_used: llmDescription(),
          generated_at: new Date().toISOString(),
        },
        { onConflict: "skill_id" },
      )
      .select("*")
      .single();
    if (error || !saved) throw error ?? new Error("market upsert failed");
    return NextResponse.json(saved);
  } catch (err) {
    console.error("market snapshot generation failed:", err);
    // Fall back to stale data if generation fails.
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "Could not load market data." }, { status: 500 });
  }
}
