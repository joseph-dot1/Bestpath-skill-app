export type LevelData = {
  id: string;
  index: number;
  name: string;
  is_free: boolean;
  modules: {
    id: string;
    index: number;
    title: string;
    objectives: unknown;
    est_hours: number | null;
    hydration_status: string;
    lessons: { id: string; index: number; title: string }[];
  }[];
};

export function RoadmapView({
  skillTitle,
  levels,
  completedLessons,
  totalLessons,
  totalWeeks,
  weeklyHours,
}: {
  skillTitle: string;
  levels: LevelData[];
  completedLessons: number;
  totalLessons: number;
  totalWeeks: number;
  weeklyHours: number | null;
}) {
  const pct =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header + plan strip */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted">
          Your roadmap
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold">{skillTitle}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-muted">
          <span>
            <strong className="text-foreground">{totalWeeks}</strong> week plan
          </span>
          <span>
            <strong className="text-foreground">{weeklyHours ?? 5}</strong>{" "}
            hrs/week
          </span>
          <span>
            <strong className="text-foreground">{totalLessons}</strong> lessons
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </span>
            {pct}%
          </span>
        </div>
      </div>

      {/* Levels as a vertical path */}
      <ol className="relative mt-8 space-y-6 border-l border-border pl-6">
        {levels.map((level) => (
          <li key={level.id} className="relative">
            <span
              className={`absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                level.is_free
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {level.index + 1}
            </span>

            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-lg font-semibold">
                {level.name}
              </h2>
              {level.is_free ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Free
                </span>
              ) : (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  Pro
                </span>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {level.modules.map((mod) => (
                <div
                  key={mod.id}
                  className="rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{mod.title}</h3>
                    <span className="shrink-0 text-xs text-muted">
                      ~{mod.est_hours ?? "?"}h
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {mod.lessons.length} lessons ·{" "}
                    {mod.hydration_status === "hydrated"
                      ? "resources ready"
                      : "resources coming when you get here"}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {mod.lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="truncate text-xs text-muted"
                      >
                        – {lesson.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
