import { NextResponse } from "next/server";
import { getOrHydrateToolkit } from "@/lib/curation/pipeline";
import { isLlmConfigured, llmErrorMessage } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isYouTubeConfigured } from "@/lib/youtube";

export const maxDuration = 300;

/** POST /api/skills/:skillId/toolkit
    The skill's "Professional toolkit" — optional adjacent competencies with
    curated videos. Generated once per skill, then served from cache. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ skillId: string }> },
) {
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

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  const { skillId } = await params;

  // Serving from cache needs no AI/YouTube keys — only first generation does.
  try {
    const items = await getOrHydrateToolkit(admin, skillId);
    if (items.length === 0 && (!isLlmConfigured() || !isYouTubeConfigured())) {
      return NextResponse.json({ items: [], pending: true });
    }
    return NextResponse.json({ items });
  } catch (err) {
    console.error(`toolkit failed for skill ${skillId}:`, err);
    return NextResponse.json(
      { error: llmErrorMessage(err, "Toolkit unavailable right now — it will retry next visit.") },
      { status: 503 },
    );
  }
}
