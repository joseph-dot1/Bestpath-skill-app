// Plan-drift detection: weekly plans die on contact with week 2 unless the
// product notices and offers a cheap way back. This computes where a learner
// stands against their plan — all deterministic, no AI.

export type PlanStanding = {
  currentWeek: number; // 1-based; clamped to plan length
  totalWeeks: number;
  expectedLessons: number; // lessons planned in fully-elapsed weeks
  completedLessons: number;
  totalLessons: number;
  status: "on_track" | "behind" | "done" | "no_plan";
};

const BEHIND_TOLERANCE = 0.7; // <70% of expected pace counts as behind

export function computePlanStanding(input: {
  planStartedAt: string;
  weeks: { week_index: number; planned_lesson_ids: unknown }[];
  completedLessonIds: Set<string>;
  allLessonIds: string[];
}): PlanStanding {
  const totalWeeks = input.weeks.length;
  const totalLessons = input.allLessonIds.length;
  const completedLessons = input.allLessonIds.filter((id) =>
    input.completedLessonIds.has(id),
  ).length;

  if (totalWeeks === 0 || totalLessons === 0) {
    return {
      currentWeek: 0,
      totalWeeks,
      expectedLessons: 0,
      completedLessons,
      totalLessons,
      status: "no_plan",
    };
  }
  if (completedLessons >= totalLessons) {
    return {
      currentWeek: totalWeeks,
      totalWeeks,
      expectedLessons: totalLessons,
      completedLessons,
      totalLessons,
      status: "done",
    };
  }

  const elapsedWeeks = Math.floor(
    (Date.now() - new Date(input.planStartedAt).getTime()) / (7 * 24 * 3600 * 1000),
  );
  const currentWeek = Math.min(totalWeeks, elapsedWeeks + 1);

  const expectedLessons = input.weeks
    .filter((w) => w.week_index < currentWeek - 1)
    .reduce(
      (sum, w) =>
        sum + (Array.isArray(w.planned_lesson_ids) ? w.planned_lesson_ids.length : 0),
      0,
    );

  const status =
    expectedLessons > 0 && completedLessons < expectedLessons * BEHIND_TOLERANCE
      ? "behind"
      : "on_track";

  return {
    currentWeek,
    totalWeeks,
    expectedLessons,
    completedLessons,
    totalLessons,
    status,
  };
}
