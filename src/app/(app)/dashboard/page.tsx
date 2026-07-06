import Link from "next/link";
import { computePlanStanding, type PlanStanding } from "@/lib/plan-status";
import { createClient } from "@/lib/supabase/server";
import { SEED_SKILLS } from "@/lib/seed-skills";
import { ReplanButton } from "@/components/replan-button";

export const metadata = { title: "Dashboard" };

type EnrollmentCard = {
  id: string;
  skillTitle: string;
  standing: PlanStanding;
  continueModuleId: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) return <EmptyState />;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, plan_started_at, skills ( title )")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (!enrollments || enrollments.length === 0) {
    return <EmptyState />;
  }

  const { data: completions } = await supabase
    .from("lesson_completions")
    .select("lesson_id")
    .eq("user_id", user?.id ?? "");
  const completed = new Set((completions ?? []).map((c) => c.lesson_id));

  const cards: EnrollmentCard[] = [];
  for (const e of enrollments) {
    const [{ data: weeks }, { data: levels }] = await Promise.all([
      supabase
        .from("weekly_plans")
        .select("week_index, planned_lesson_ids")
        .eq("enrollment_id", e.id),
      supabase
        .from("levels")
        .select(
          "index, roadmaps!inner ( enrollment_id ), modules ( id, index, lessons ( id, index ) )",
        )
        .eq("roadmaps.enrollment_id", e.id),
    ]);

    // Path-ordered lessons + the first module with an incomplete lesson.
    const orderedModules = (levels ?? [])
      .sort((a, b) => a.index - b.index)
      .flatMap((l) => (l.modules ?? []).sort((a, b) => a.index - b.index));
    const allLessonIds = orderedModules.flatMap((m) =>
      (m.lessons ?? []).sort((a, b) => a.index - b.index).map((ls) => ls.id),
    );
    const continueModule =
      orderedModules.find((m) =>
        (m.lessons ?? []).some((ls) => !completed.has(ls.id)),
      ) ?? null;

    const skillRel = e.skills;
    cards.push({
      id: e.id,
      skillTitle:
        (Array.isArray(skillRel)
          ? skillRel[0]?.title
          : (skillRel as { title: string } | null)?.title) ?? "Untitled skill",
      standing: computePlanStanding({
        planStartedAt: e.plan_started_at,
        weeks: weeks ?? [],
        completedLessonIds: completed,
        allLessonIds,
      }),
      continueModuleId: continueModule?.id ?? null,
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Your skills</h1>
        <Link
          href="/assessment"
          className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
        >
          + New skill
        </Link>
      </div>

      <ul className="mt-6 space-y-4">
        {cards.map((card) => (
          <li key={card.id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/skills/${card.id}`}
                className="font-display font-semibold hover:text-accent"
              >
                {card.skillTitle}
              </Link>
              <StatusChip standing={card.standing} />
            </div>

            <ProgressRow standing={card.standing} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {card.continueModuleId && (
                <Link
                  href={`/modules/${card.continueModuleId}`}
                  className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
                >
                  Continue →
                </Link>
              )}
              <Link
                href={`/skills/${card.id}`}
                className="rounded-full border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                Roadmap
              </Link>
              {card.standing.status === "behind" && (
                <ReplanButton enrollmentId={card.id} compact />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusChip({ standing }: { standing: PlanStanding }) {
  if (standing.status === "done") {
    return (
      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
        Complete 🎉
      </span>
    );
  }
  if (standing.status === "behind") {
    return (
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Behind plan
      </span>
    );
  }
  if (standing.status === "no_plan") return null;
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
      Week {standing.currentWeek}/{standing.totalWeeks}
    </span>
  );
}

function ProgressRow({ standing }: { standing: PlanStanding }) {
  const pct =
    standing.totalLessons > 0
      ? Math.round((standing.completedLessons / standing.totalLessons) * 100)
      : 0;
  return (
    <div className="mt-3 flex items-center gap-3 text-xs text-muted">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="shrink-0">
        {standing.completedLessons}/{standing.totalLessons} lessons · {pct}%
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl">
        🧭
      </div>
      <h1 className="font-display mt-6 text-2xl font-bold">
        Pick your first skill
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Choose a skill and answer a few questions — your personalized roadmap
        arrives in under a minute.
      </p>
      <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
        {SEED_SKILLS.map((skill) => (
          <Link
            key={skill.slug}
            href={`/assessment?skill=${skill.slug}`}
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            {skill.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
