// Deterministic weekly plan: no AI needed. Lessons are scheduled in roadmap
// order into weeks sized by the learner's stated weekly hours. Recomputed by
// the replan mechanic (Milestone 5) when the learner falls behind.

export type PlannedLesson = {
  lessonId: string;
  estHours: number;
};

const MAX_WEEKS = 52;

export function buildWeeklyPlan(
  lessons: PlannedLesson[],
  weeklyHours: number | null | undefined,
): string[][] {
  const capacity = Math.max(1, weeklyHours ?? 5);
  const weeks: string[][] = [];

  let week: string[] = [];
  let used = 0;

  for (const lesson of lessons) {
    const cost = Math.max(0.25, lesson.estHours);
    // Start a new week when this lesson doesn't fit — unless the week is
    // empty (a single lesson longer than the budget still gets scheduled).
    if (week.length > 0 && used + cost > capacity) {
      weeks.push(week);
      week = [];
      used = 0;
      if (weeks.length >= MAX_WEEKS) break;
    }
    week.push(lesson.lessonId);
    used += cost;
  }
  if (week.length > 0 && weeks.length < MAX_WEEKS) {
    weeks.push(week);
  }
  return weeks;
}
