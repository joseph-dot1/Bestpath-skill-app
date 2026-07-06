import { NextResponse } from "next/server";
import {
  isEmailConfigured,
  sendIdleNudgeEmail,
  sendReplanEmail,
} from "@/lib/email";
import { computePlanStanding } from "@/lib/plan-status";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const IDLE_DAYS = 3;
const NUDGE_COOLDOWN_DAYS = 4; // never email the same learner twice in this window

/**
 * GET /api/cron/nudges — run daily (Vercel cron, see vercel.json).
 * Two nudges, one email max per learner per run:
 *  - behind their weekly plan  → replan email
 *  - idle for 3+ days          → next-lesson nudge
 * Protected by CRON_SECRET (Authorization: Bearer <secret>).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: "RESEND_API_KEY not set" });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id, user_id, plan_started_at, skills ( title )")
    .eq("status", "active");

  let sent = 0;
  const now = Date.now();

  for (const enrollment of enrollments ?? []) {
    try {
      // Cooldown: skip anyone nudged recently.
      const { data: lastNudge } = await admin
        .from("events")
        .select("created_at")
        .eq("user_id", enrollment.user_id)
        .eq("name", "nudge_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        lastNudge &&
        now - new Date(lastNudge.created_at).getTime() <
          NUDGE_COOLDOWN_DAYS * 864e5
      ) {
        continue;
      }

      // Last activity = most recent event of any kind.
      const { data: lastEvent } = await admin
        .from("events")
        .select("created_at")
        .eq("user_id", enrollment.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const idleDays = lastEvent
        ? (now - new Date(lastEvent.created_at).getTime()) / 864e5
        : Infinity;
      if (idleDays < IDLE_DAYS) continue; // active learners get no email

      // Plan standing.
      const [{ data: weeks }, { data: levels }, { data: completions }] =
        await Promise.all([
          admin
            .from("weekly_plans")
            .select("week_index, planned_lesson_ids")
            .eq("enrollment_id", enrollment.id),
          admin
            .from("levels")
            .select(
              "roadmaps!inner ( enrollment_id ), modules ( lessons ( id ) )",
            )
            .eq("roadmaps.enrollment_id", enrollment.id),
          admin
            .from("lesson_completions")
            .select("lesson_id")
            .eq("user_id", enrollment.user_id),
        ]);

      const allLessonIds = (levels ?? []).flatMap((l) =>
        (l.modules ?? []).flatMap((m) => (m.lessons ?? []).map((ls) => ls.id)),
      );
      const standing = computePlanStanding({
        planStartedAt: enrollment.plan_started_at,
        weeks: weeks ?? [],
        completedLessonIds: new Set((completions ?? []).map((c) => c.lesson_id)),
        allLessonIds,
      });
      if (standing.status === "done" || standing.status === "no_plan") continue;

      const { data: userData } = await admin.auth.admin.getUserById(
        enrollment.user_id,
      );
      const email = userData?.user?.email;
      if (!email) continue;

      const skillRel = enrollment.skills;
      const skillTitle =
        (Array.isArray(skillRel)
          ? skillRel[0]?.title
          : (skillRel as { title: string } | null)?.title) ?? "your skill";

      const ok =
        standing.status === "behind"
          ? await sendReplanEmail(email, skillTitle, enrollment.id)
          : await sendIdleNudgeEmail(email, skillTitle, enrollment.id);

      if (ok) {
        sent++;
        await admin.from("events").insert({
          user_id: enrollment.user_id,
          name: "nudge_sent",
          props: {
            enrollment_id: enrollment.id,
            kind: standing.status === "behind" ? "replan" : "idle",
          },
        });
      }
    } catch (err) {
      console.error(`nudge failed for enrollment ${enrollment.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
