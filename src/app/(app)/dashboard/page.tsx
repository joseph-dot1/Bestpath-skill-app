import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEED_SKILLS } from "@/lib/seed-skills";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: enrollments } = supabase
    ? await supabase
        .from("enrollments")
        .select("id, status, skills ( title, slug )")
        .eq("status", "active")
    : { data: null };

  if (!enrollments || enrollments.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Your skills</h1>
      <ul className="mt-6 space-y-3">
        {enrollments.map((e) => {
          const skill = Array.isArray(e.skills) ? e.skills[0] : e.skills;
          return (
            <li key={e.id}>
              <Link
                href={`/skills/${e.id}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent"
              >
                <span className="font-display font-semibold">
                  {skill?.title ?? "Untitled skill"}
                </span>
                <span className="text-sm text-muted">View roadmap →</span>
              </Link>
            </li>
          );
        })}
      </ul>
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
