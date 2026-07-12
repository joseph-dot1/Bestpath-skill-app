import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { recurateModule } from "@/lib/curation/pipeline";
import { isLlmConfigured, llmErrorMessage, LLM_NOT_CONFIGURED_MESSAGE } from "@/lib/llm";
import { isYouTubeConfigured } from "@/lib/youtube";

export const maxDuration = 300;

/** POST /api/admin/modules/:moduleId/recurate
    Retires the module's current video pools and rebuilds them with the
    current pipeline (trusted creators, mentor re-rank). Admin only. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  if (!isLlmConfigured() || !isYouTubeConfigured()) {
    return NextResponse.json(
      { error: `Re-curation needs an AI key and a YouTube key. ${LLM_NOT_CONFIGURED_MESSAGE}` },
      { status: 503 },
    );
  }

  const { moduleId } = await params;
  try {
    await recurateModule(guard.admin, moduleId);
    return NextResponse.json({ status: "recurated" });
  } catch (err) {
    console.error(`re-curation failed for module ${moduleId}:`, err);
    return NextResponse.json(
      { error: llmErrorMessage(err, "Re-curation failed — please retry.") },
      { status: 503 },
    );
  }
}
