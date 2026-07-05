import Link from "next/link";
import { SEED_SKILLS } from "@/lib/seed-skills";

export function SkillPicker() {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <h1 className="font-display text-2xl font-bold">
        What do you want to learn?
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Pick a skill or type your own — then answer a few questions so we can
        build your roadmap.
      </p>

      <form action="/assessment" method="get" className="mt-8 flex w-full max-w-md gap-2">
        <input
          type="text"
          name="skill"
          required
          placeholder="e.g. Welding, Photography…"
          className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
        >
          Start
        </button>
      </form>

      <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
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
