import type { LearnerProfile } from "@/lib/assessment/engine";
import {
  isLlmConfigured,
  llmDescription,
  llmErrorMessage,
  LLM_NOT_CONFIGURED_MESSAGE,
} from "@/lib/llm";
import { streamRoadmapSkeleton, type SkeletonLevel } from "@/lib/roadmap/generator";
import { buildWeeklyPlan, type PlannedLesson } from "@/lib/roadmap/weekly-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120; // roadmap generation can take a while

function sseEncode(event: object) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * POST /api/roadmaps  Body: { enrollmentId }
 * Streams SSE events while the skeleton generates:
 *   {type:"status", message} | {type:"level", level, index}
 *   | {type:"done", roadmapId} | {type:"error", message}
 * Generated roadmaps are cached in Postgres — an existing roadmap short-
 * circuits to `done` immediately (never regenerate on page load).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return jsonError("Supabase not configured", 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Not signed in", 401);

  let body: { enrollmentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const enrollmentId = typeof body.enrollmentId === "string" ? body.enrollmentId : "";
  if (!enrollmentId) return jsonError("enrollmentId required", 400);

  // RLS scopes this to the caller's own enrollments.
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, weekly_hours, assessment_transcript, skills ( title )")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) return jsonError("Enrollment not found", 404);

  const admin = createAdminClient();
  if (!admin) return jsonError("SUPABASE_SERVICE_ROLE_KEY is not set", 503);

  // Already generated? Return it — roadmaps are cached, never regenerated.
  const { data: existing } = await admin
    .from("roadmaps")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return new Response(sseEncode({ type: "done", roadmapId: existing.id }), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (!isLlmConfigured()) {
    return jsonError(LLM_NOT_CONFIGURED_MESSAGE, 503);
  }

  const skillRel = enrollment.skills;
  const skillTitle =
    (Array.isArray(skillRel) ? skillRel[0]?.title : (skillRel as { title: string } | null)?.title) ??
    "the chosen skill";
  const transcript = enrollment.assessment_transcript as {
    profile?: LearnerProfile;
  } | null;
  const profile = transcript?.profile;
  if (!profile) return jsonError("Enrollment has no learner profile", 409);

  const weeklyHours = enrollment.weekly_hours;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: object) => controller.enqueue(sseEncode(evt));
      try {
        send({ type: "status", message: "Designing your roadmap…" });

        let levels: SkeletonLevel[] | null = null;
        for await (const evt of streamRoadmapSkeleton(skillTitle, profile)) {
          if (evt.type === "level") {
            send(evt);
          } else {
            levels = evt.levels;
          }
        }
        if (!levels) throw new Error("Generation produced no skeleton");

        send({ type: "status", message: "Planning your weeks…" });
        const roadmapId = await persistRoadmap(
          admin,
          enrollmentId,
          levels,
          weeklyHours,
        );

        send({ type: "done", roadmapId });
      } catch (err) {
        console.error("roadmap generation failed:", err);
        send({
          type: "error",
          message: llmErrorMessage(err, "Roadmap generation failed — please retry."),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

// ---------------------------------------------------------------------------
// Persist the skeleton: roadmap → levels → modules → lessons → weekly plan.
// Service-role writes (users have read-only access to these tables).
// ---------------------------------------------------------------------------
async function persistRoadmap(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  enrollmentId: string,
  levels: SkeletonLevel[],
  weeklyHours: number | null,
): Promise<string> {
  const { data: roadmap, error: roadmapError } = await admin
    .from("roadmaps")
    .insert({ enrollment_id: enrollmentId, model_used: llmDescription() })
    .select("id")
    .single();
  if (roadmapError || !roadmap) throw roadmapError ?? new Error("roadmap insert failed");

  const plannedLessons: PlannedLesson[] = [];

  for (const [levelIndex, level] of levels.entries()) {
    const { data: levelRow, error: levelError } = await admin
      .from("levels")
      .insert({
        roadmap_id: roadmap.id,
        index: levelIndex,
        name: level.name,
        is_free: levelIndex === 0, // Beginner is the free tier
      })
      .select("id")
      .single();
    if (levelError || !levelRow) throw levelError ?? new Error("level insert failed");

    for (const [moduleIndex, mod] of level.modules.entries()) {
      const { data: moduleRow, error: moduleError } = await admin
        .from("modules")
        .insert({
          level_id: levelRow.id,
          index: moduleIndex,
          title: mod.title,
          objectives: mod.objectives,
          est_hours: mod.est_hours,
        })
        .select("id")
        .single();
      if (moduleError || !moduleRow) throw moduleError ?? new Error("module insert failed");

      const lessonRows = mod.lessons.map((title, i) => ({
        module_id: moduleRow.id,
        index: i,
        title,
      }));
      const { data: insertedLessons, error: lessonError } = await admin
        .from("lessons")
        .insert(lessonRows)
        .select("id, index");
      if (lessonError || !insertedLessons) {
        throw lessonError ?? new Error("lesson insert failed");
      }

      const perLessonHours = mod.est_hours / Math.max(1, mod.lessons.length);
      for (const lesson of insertedLessons.sort((a, b) => a.index - b.index)) {
        plannedLessons.push({ lessonId: lesson.id, estHours: perLessonHours });
      }
    }
  }

  const weeks = buildWeeklyPlan(plannedLessons, weeklyHours);
  if (weeks.length > 0) {
    const { error: planError } = await admin.from("weekly_plans").insert(
      weeks.map((lessonIds, i) => ({
        enrollment_id: enrollmentId,
        week_index: i,
        planned_lesson_ids: lessonIds,
      })),
    );
    if (planError) throw planError;
  }

  return roadmap.id;
}
