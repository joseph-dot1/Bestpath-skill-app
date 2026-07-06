import { NextResponse } from "next/server";
import { buildWeeklyPlan, type PlannedLesson } from "@/lib/roadmap/weekly-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/enrollments/:enrollmentId/replan
 * Body (optional): { weeklyHours?: number }
 * Rebuilds the weekly plan from the REMAINING (incomplete) lessons, starting
 * from today. Falling behind becomes a one-tap reset instead of a monument
 * to failure. Deterministic — no AI call.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const { enrollmentId } = await params;

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

  let newWeeklyHours: number | null = null;
  try {
    const body = await request.json();
    if (typeof body?.weeklyHours === "number" && body.weeklyHours >= 1 && body.weeklyHours <= 80) {
      newWeeklyHours = Math.round(body.weeklyHours);
    }
  } catch {
    // empty body is fine
  }

  // Ownership via RLS.
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, weekly_hours")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  // All lessons on the roadmap in path order, with per-lesson hour estimates.
  const { data: levels } = await supabase
    .from("levels")
    .select(
      `index, roadmaps!inner ( enrollment_id ),
       modules ( index, est_hours, lessons ( id, index ) )`,
    )
    .eq("roadmaps.enrollment_id", enrollmentId);

  const ordered: PlannedLesson[] = (levels ?? [])
    .sort((a, b) => a.index - b.index)
    .flatMap((level) =>
      (level.modules ?? [])
        .sort((a, b) => a.index - b.index)
        .flatMap((m) => {
          const lessons = (m.lessons ?? []).sort((a, b) => a.index - b.index);
          const per = (m.est_hours ?? lessons.length) / Math.max(1, lessons.length);
          return lessons.map((l) => ({ lessonId: l.id, estHours: per }));
        }),
    );

  const { data: completions } = await supabase
    .from("lesson_completions")
    .select("lesson_id")
    .eq("user_id", user.id);
  const done = new Set((completions ?? []).map((c) => c.lesson_id));

  const remaining = ordered.filter((l) => !done.has(l.lessonId));
  if (remaining.length === 0) {
    return NextResponse.json({ error: "Nothing left to plan — you're done!" }, { status: 409 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  const weeklyHours = newWeeklyHours ?? enrollment.weekly_hours ?? 5;
  const weeks = buildWeeklyPlan(remaining, weeklyHours);

  // Replace the plan wholesale; week 0 restarts today.
  await admin.from("weekly_plans").delete().eq("enrollment_id", enrollmentId);
  const { error: planError } = await admin.from("weekly_plans").insert(
    weeks.map((lessonIds, i) => ({
      enrollment_id: enrollmentId,
      week_index: i,
      planned_lesson_ids: lessonIds,
      status: "replanned" as const,
    })),
  );
  if (planError) {
    console.error("replan insert failed:", planError);
    return NextResponse.json({ error: "Replan failed — retry." }, { status: 500 });
  }

  // The plan clock restarts now: plan_started_at anchors week math.
  const updates: Record<string, unknown> = {
    plan_started_at: new Date().toISOString(),
  };
  if (newWeeklyHours) updates.weekly_hours = newWeeklyHours;
  await supabase.from("enrollments").update(updates).eq("id", enrollmentId);

  await supabase.from("events").insert({
    user_id: user.id,
    name: "plan_replanned",
    props: { enrollment_id: enrollmentId, weeks: weeks.length, weekly_hours: weeklyHours },
  });

  return NextResponse.json({ ok: true, weeks: weeks.length });
}
