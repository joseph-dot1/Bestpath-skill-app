import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoadmapGenerator } from "./roadmap-generator";
import { RoadmapView, type LevelData } from "./roadmap-view";

export const metadata = { title: "Roadmap" };

export default async function SkillRoadmapPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, weekly_hours, skills ( title )")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) notFound();

  const skillRel = enrollment.skills;
  const skillTitle =
    (Array.isArray(skillRel)
      ? skillRel[0]?.title
      : (skillRel as { title: string } | null)?.title) ?? "Your skill";

  const { data: roadmap } = await supabase
    .from("roadmaps")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No roadmap yet → the streaming generation experience.
  if (!roadmap) {
    return (
      <RoadmapGenerator enrollmentId={enrollmentId} skillTitle={skillTitle} />
    );
  }

  const { data: levels } = await supabase
    .from("levels")
    .select(
      "id, index, name, is_free, modules ( id, index, title, objectives, est_hours, hydration_status, lessons ( id, index, title ) )",
    )
    .eq("roadmap_id", roadmap.id);

  const sorted: LevelData[] = (levels ?? [])
    .sort((a, b) => a.index - b.index)
    .map((level) => ({
      ...level,
      modules: (level.modules ?? [])
        .sort((a, b) => a.index - b.index)
        .map((m) => ({
          ...m,
          lessons: (m.lessons ?? []).sort((a, b) => a.index - b.index),
        })),
    }));

  const lessonIds = sorted.flatMap((l) =>
    l.modules.flatMap((m) => m.lessons.map((ls) => ls.id)),
  );

  const [{ count: completedCount }, { count: weekCount }] = await Promise.all([
    supabase
      .from("lesson_completions")
      .select("lesson_id", { count: "exact", head: true })
      .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["-"]),
    supabase
      .from("weekly_plans")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId),
  ]);

  return (
    <RoadmapView
      skillTitle={skillTitle}
      levels={sorted}
      completedLessons={completedCount ?? 0}
      totalLessons={lessonIds.length}
      totalWeeks={weekCount ?? 0}
      weeklyHours={enrollment.weekly_hours}
    />
  );
}
