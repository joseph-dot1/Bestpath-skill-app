import { NextResponse } from "next/server";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { hydrateModule } from "@/lib/curation/pipeline";
import { canAccessLevel, getUserTier } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isYouTubeConfigured } from "@/lib/youtube";

export const maxDuration = 300; // search + verify + rank across a whole module

/**
 * POST /api/modules/:moduleId/hydrate
 * Fills in lesson topics, summaries, and verified resources for one module.
 * Idempotent: hydrated modules return immediately; a concurrent hydration
 * returns 202 so the client polls instead of double-spending quota.
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

  // Ownership check through RLS — a module the user can't read 404s here.
  const { data: mod } = await supabase
    .from("modules")
    .select("id, hydration_status, levels ( is_free )")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  // Tier gate: hydration is the expensive step — never spend quota on
  // levels the learner can't open.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const isFree: boolean = (mod as any).levels?.is_free ?? false;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tier = await getUserTier(supabase, user.id);
  if (!canAccessLevel(tier, isFree)) {
    return NextResponse.json({ error: "Upgrade to Pro to unlock this level." }, { status: 403 });
  }
  if (mod.hydration_status === "hydrated") {
    return NextResponse.json({ status: "hydrated" });
  }
  if (mod.hydration_status === "hydrating") {
    return NextResponse.json({ status: "hydrating" }, { status: 202 });
  }

  if (!isAnthropicConfigured() || !isYouTubeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY and YOUTUBE_API_KEY are required for resource curation." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  try {
    await hydrateModule(admin, moduleId);
    return NextResponse.json({ status: "hydrated" });
  } catch (err) {
    console.error(`hydration failed for module ${moduleId}:`, err);
    return NextResponse.json(
      { error: "Hydration failed — please retry." },
      { status: 500 },
    );
  }
}
