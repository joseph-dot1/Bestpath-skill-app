import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ModuleHydrator } from "./module-hydrator";
import { LessonList, type LessonWithResources } from "./lesson-list";

export const metadata = { title: "Module" };

export default async function ModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: mod } = await supabase
    .from("modules")
    .select(
      `id, index, title, objectives, est_hours, hydration_status, level_id,
       levels ( id, name, roadmap_id, roadmaps ( enrollment_id ) )`,
    )
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const level = mod.levels as any;
  const enrollmentId: string | undefined = level?.roadmaps?.enrollment_id;
  const levelName: string = level?.name ?? "";
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Not hydrated yet → curation experience (triggers hydration, then reloads).
  if (mod.hydration_status !== "hydrated") {
    return (
      <ModuleHydrator
        moduleId={moduleId}
        moduleTitle={mod.title}
        alreadyRunning={mod.hydration_status === "hydrating"}
      />
    );
  }

  // Hydrated → lessons with their verified resources.
  const { data: lessons } = await supabase
    .from("lessons")
    .select(
      `id, index, title, summary,
       lesson_resources ( rank, resources ( id, kind, url, title, channel, stats, published_at ) )`,
    )
    .eq("module_id", moduleId);

  const { data: completions } = await supabase
    .from("lesson_completions")
    .select("lesson_id")
    .in("lesson_id", (lessons ?? []).map((l) => l.id));
  const completedIds = new Set((completions ?? []).map((c) => c.lesson_id));

  const lessonData: LessonWithResources[] = (lessons ?? [])
    .sort((a, b) => a.index - b.index)
    .map((l) => ({
      id: l.id,
      title: l.title,
      summary: l.summary,
      completed: completedIds.has(l.id),
      resources: (l.lesson_resources ?? [])
        .sort((a, b) => a.rank - b.rank)
        .map((lr) => {
          const r = Array.isArray(lr.resources) ? lr.resources[0] : lr.resources;
          return r
            ? {
                id: r.id as string,
                kind: r.kind as string,
                url: r.url as string,
                title: r.title as string,
                channel: (r.channel as string | null) ?? null,
                stats: (r.stats as { views?: number; duration_s?: number }) ?? {},
                publishedAt: (r.published_at as string | null) ?? null,
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    }));

  // Hydrate the NEXT module one step ahead (fire-and-forget on the client).
  const { data: nextModule } = await supabase
    .from("modules")
    .select("id, hydration_status")
    .eq("level_id", mod.level_id)
    .eq("index", mod.index + 1)
    .maybeSingle();

  return (
    <div className="mx-auto w-full max-w-2xl">
      {enrollmentId && (
        <Link
          href={`/skills/${enrollmentId}`}
          className="text-xs text-muted hover:text-foreground"
        >
          ← Back to roadmap
        </Link>
      )}
      <p className="mt-3 text-xs uppercase tracking-widest text-muted">
        {levelName} · Module {mod.index + 1}
      </p>
      <h1 className="font-display mt-1 text-2xl font-bold">{mod.title}</h1>

      {Array.isArray(mod.objectives) && mod.objectives.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            By the end of this module you can
          </p>
          <ul className="mt-2 space-y-1">
            {(mod.objectives as string[]).map((o) => (
              <li key={o} className="text-sm text-foreground">
                ✓ {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LessonList
        lessons={lessonData}
        prefetchModuleId={
          nextModule && nextModule.hydration_status === "skeleton"
            ? nextModule.id
            : null
        }
      />
    </div>
  );
}
