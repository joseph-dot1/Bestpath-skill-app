import { NextResponse } from "next/server";
import { linkLessonResources } from "@/lib/curation/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoDetails, isYouTubeConfigured } from "@/lib/youtube";

export const maxDuration = 300;

const BATCH = 50; // one quota unit per 50 ids

/**
 * GET /api/cron/verify-resources — nightly (Vercel cron).
 * Re-verifies every active YouTube resource via batched videos.list:
 * refreshes stats, retires deleted/private/non-embeddable videos, and
 * relinks any lessons that were pointing at a dead resource. The whole
 * pool costs ~1 quota unit per 50 videos — pennies of budget.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isYouTubeConfigured()) {
    return NextResponse.json({ skipped: "YOUTUBE_API_KEY not set" });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { data: resources } = await admin
    .from("resources")
    .select("id, topic_id, youtube_video_id")
    .eq("kind", "youtube")
    .eq("status", "active")
    .not("youtube_video_id", "is", null)
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(2000);

  let verified = 0;
  let retired = 0;

  for (let i = 0; i < (resources ?? []).length; i += BATCH) {
    const batch = (resources ?? []).slice(i, i + BATCH);
    const ids = batch.map((r) => r.youtube_video_id as string);

    let details;
    try {
      details = await getVideoDetails(ids);
    } catch (err) {
      console.error("verification batch failed:", err);
      break; // quota guard tripped or API down — resume tomorrow
    }
    const byId = new Map(details.map((d) => [d.videoId, d]));
    const now = new Date().toISOString();

    for (const resource of batch) {
      const live = byId.get(resource.youtube_video_id as string);

      if (!live || !live.embeddable) {
        // Deleted, private, or no longer embeddable → retire + heal lessons.
        retired++;
        await admin.from("resources").update({ status: "dead" }).eq("id", resource.id);

        const { data: affected } = await admin
          .from("lesson_resources")
          .select("lesson_id")
          .eq("resource_id", resource.id);
        await admin.from("lesson_resources").delete().eq("resource_id", resource.id);
        for (const row of affected ?? []) {
          await linkLessonResources(admin, row.lesson_id, resource.topic_id, [
            resource.id,
          ]);
        }
      } else {
        verified++;
        await admin
          .from("resources")
          .update({
            stats: {
              views: live.viewCount,
              likes: live.likeCount,
              duration_s: live.durationSeconds,
            },
            last_verified_at: now,
          })
          .eq("id", resource.id);
      }
    }
  }

  return NextResponse.json({ ok: true, verified, retired });
}
