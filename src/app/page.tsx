import Link from "next/link";
import { Logo } from "@/components/logo";
import { SEED_SKILLS } from "@/lib/seed-skills";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    title: "Tell us where you're headed",
    body: "Answer a handful of questions about what you know, how much time you have, and what you want the skill for.",
    icon: CompassIcon,
  },
  {
    title: "Get your roadmap in seconds",
    body: "Four levels, week by week — beginner to professional — built around your schedule, not a generic syllabus.",
    icon: RouteIcon,
  },
  {
    title: "Learn from resources that earn their place",
    body: "Every video is verified and ranked. When learners downvote a resource, it gets replaced for everyone.",
    icon: ShieldCheckIcon,
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/login"
            className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5">
        {/* Hero */}
        <section className="relative flex flex-col items-center pb-16 pt-14 text-center sm:pt-20">
          {/* Glow anchoring the headline */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
          />

          <p className="animate-fade-in mb-4 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1 text-xs uppercase tracking-widest text-accent">
            Beginner → Professional
          </p>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Every skill has a{" "}
            <span className="text-gradient-accent">best path</span>.
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
              className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              className="glow-accent h-12 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-strong active:scale-95"
            >
              Start
            </button>
          </form>

          <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {SEED_SKILLS.map((skill) => (
              <Link
                key={skill.slug}
                href={`/login?skill=${skill.slug}`}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted transition-all hover:-translate-y-0.5 hover:border-accent hover:text-foreground"
              >
                {skill.title}
              </Link>
            ))}
          </div>

          {/* The product, drawn: a roadmap that draws itself */}
          <RoadmapVisual />

          {/* Trust strip */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Dot /> 10 curated skills
            </span>
            <span className="flex items-center gap-1.5">
              <Dot /> Every video live-verified
            </span>
            <span className="flex items-center gap-1.5">
              <Dot /> Pay data in ₦ &amp; $
            </span>
            <span className="flex items-center gap-1.5">
              <Dot /> Built for Nigeria first
            </span>
          </div>
        </section>

        {/* How it works */}
        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="card-lift group relative overflow-hidden rounded-2xl border border-border bg-surface p-5"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/5 blur-2xl transition-opacity group-hover:bg-accent/10"
                />
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                    <Icon />
                  </span>
                  <span className="font-display text-3xl font-bold text-border transition-colors group-hover:text-accent/30">
                    0{i + 1}
                  </span>
                </div>
                <h2 className="font-display mt-4 text-base font-semibold">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            );
          })}
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
                  className="card-lift group relative overflow-hidden rounded-2xl border border-border bg-surface p-4"
                >
                  <span
                    aria-hidden
                    className="font-display pointer-events-none absolute -bottom-4 -right-1 text-7xl font-bold text-accent/5 transition-colors group-hover:text-accent/10"
                  >
                    ₦
                  </span>
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

        {/* Closing CTA */}
        <section className="pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-surface px-6 py-12 text-center sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-0 h-56 w-[34rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl"
            />
            <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative">
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
                Your best path starts today.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
                The full Beginner level is free — roadmap, verified videos,
                quizzes, and your first checkpoint included.
              </p>
              <Link
                href="/login"
                className="glow-accent mt-8 inline-block rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-strong active:scale-95"
              >
                Get your roadmap →
              </Link>
            </div>
          </div>
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

/* --------------------------------------------------------------------------
 * Hero visual: the product in one picture — a roadmap that draws itself from
 * Beginner to Professional, with the trust markers floating alongside.
 * Pure SVG + CSS, no client JS.
 * ------------------------------------------------------------------------ */
function RoadmapVisual() {
  const pathD =
    "M 40 250 C 130 250 150 190 230 190 C 310 190 330 120 410 120 C 490 120 520 50 600 50";
  return (
    <div className="bg-dots card-lift mt-12 w-full overflow-hidden rounded-3xl border border-border bg-surface p-4 sm:p-6">
      <svg
        viewBox="0 0 640 300"
        role="img"
        aria-label="A learning roadmap from Beginner to Professional"
        className="h-auto w-full"
      >
        <defs>
          <linearGradient id="path-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>

        {/* Track (always visible) + the drawn path */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3"
          strokeDasharray="1 10"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d={pathD}
          fill="none"
          stroke="url(#path-grad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={1}
          className="animate-draw-path"
        />

        {/* Level nodes */}
        <g>
          {/* Beginner — completed */}
          <circle cx="40" cy="250" r="9" fill="var(--accent)" />
          <path
            d="M 36 250 l 3 3 l 6 -6"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x="24" y="278" className="rv-label" fill="var(--foreground)" fontWeight="600">
            Beginner
          </text>

          {/* Intermediate */}
          <circle cx="230" cy="190" r="8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
          <text x="188" y="222" className="rv-label" fill="var(--muted)">
            Intermediate
          </text>

          {/* Advanced */}
          <circle cx="410" cy="120" r="8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" opacity="0.75" />
          <text x="380" y="152" className="rv-label" fill="var(--muted)">
            Advanced
          </text>

          {/* Professional — the destination, pulsing */}
          <circle cx="600" cy="50" r="16" fill="var(--accent)" opacity="0.18" className="animate-pulse-dot" />
          <circle cx="600" cy="50" r="8" fill="var(--surface)" stroke="var(--accent-strong)" strokeWidth="2.5" />
          <text x="612" y="86" className="rv-label" fill="var(--foreground)" fontWeight="600" textAnchor="end">
            Professional
          </text>
        </g>

        {/* Floating trust chips */}
        <g className="hidden sm:block animate-floaty">
          <rect x="160" y="120" width="140" height="32" rx="16" fill="var(--surface-raised)" stroke="var(--border)" />
          <circle cx="182" cy="136" r="7" fill="var(--accent)" opacity="0.9" />
          <path d="M 179.5 136 l 2 2 l 4 -4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="198" y="141" fontSize="12.5" fill="var(--foreground)">
            Verified video
          </text>
        </g>
        <g className="hidden sm:block animate-floaty" style={{ animationDelay: "-2.2s" }}>
          <rect x="420" y="180" width="150" height="32" rx="16" fill="var(--surface-raised)" stroke="var(--border)" />
          <circle cx="442" cy="196" r="7" fill="var(--accent)" opacity="0.9" />
          <path d="M 439.5 196 l 2 2 l 4 -4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="458" y="201" fontSize="12.5" fill="var(--foreground)">
            Checkpoint passed
          </text>
        </g>
      </svg>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />;
}

/* Inline stroke icons — no icon library needed. */
function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6z" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <path d="M7 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h8" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}
