import Link from "next/link";
import { Logo } from "@/components/logo";
import { SEED_SKILLS } from "@/lib/seed-skills";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    title: "Tell us where you're headed",
    body: "Answer a handful of questions about what you know, how much time you have, and what you want the skill for.",
  },
  {
    title: "Get your roadmap in seconds",
    body: "Four levels, week by week — beginner to professional — built around your schedule, not a generic syllabus.",
  },
  {
    title: "Learn from resources that earn their place",
    body: "Every video is verified and ranked. When learners downvote a resource, it gets replaced for everyone.",
  },
];

type EarningRow = {
  skillTitle: string;
  slug: string;
  payBeginner: string;
};

// Cached market snapshots surface real pay ranges on the landing page. This
// fills in as skills get explored (generation happens on the skill page).
async function getEarnings(): Promise<EarningRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skill_market")
    .select("pay_beginner, skills!inner ( title, slug, status )")
    .order("generated_at", { ascending: false })
    .limit(6);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? [])
    .map((row: any) => ({
      skillTitle: row.skills?.title as string,
      slug: row.skills?.slug as string,
      payBeginner: row.pay_beginner as string,
    }))
    .filter((r) => r.skillTitle && r.slug);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export default async function Home() {
  const earnings = await getEarnings();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <Link
          href="/login"
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5">
        {/* Hero */}
        <section className="flex flex-col items-center pb-16 pt-14 text-center sm:pt-24">
          <p className="mb-4 rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-widest text-muted">
            Beginner → Professional
          </p>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Every skill has a{" "}
            <span className="text-accent">best path</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
            Type the skill you want to learn. Get a personalized roadmap where
            every resource is verified, every level has a checkpoint, and your
            weekly plan fits your life.
          </p>

          {/* Skill picker — wires into the assessment in Milestone 1.
              For now every path routes through sign-in. */}
          <form
            action="/login"
            method="get"
            className="mt-8 flex w-full max-w-md items-center gap-2"
          >
            <input
              type="text"
              name="skill"
              required
              placeholder="I want to learn…"
              className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
            >
              Start
            </button>
          </form>

          <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {SEED_SKILLS.map((skill) => (
              <Link
                key={skill.slug}
                href={`/login?skill=${skill.slug}`}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                {skill.title}
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <span className="font-display text-sm font-bold text-accent">
                0{i + 1}
              </span>
              <h2 className="font-display mt-2 text-base font-semibold">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          ))}
        </section>

        {/* What these skills pay — real market context, not just courses */}
        <section className="pb-24">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">
              What these skills actually pay
            </h2>
            <span className="text-xs text-muted">
              Naira &amp; USD · updated per skill
            </span>
          </div>

          {earnings.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {earnings.map((e) => (
                <Link
                  key={e.slug}
                  href={`/login?skill=${e.slug}`}
                  className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent"
                >
                  <p className="font-display text-sm font-semibold">
                    {e.skillTitle}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">
                    Beginner pay
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {e.payBeginner}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 max-w-xl text-sm text-muted">
              Every roadmap comes with a live market snapshot — real beginner and
              experienced pay ranges (Naira and USD), how much demand there is,
              and an honest read on how AI is changing the skill. Pick a skill
              above to see it.
            </p>
          )}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 text-xs text-muted">
          <span>© {new Date().getFullYear()} Bestpath</span>
          <span>Built for learners, first in Nigeria 🇳🇬</span>
        </div>
      </footer>
    </div>
  );
}
