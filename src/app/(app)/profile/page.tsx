import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "Profile" };

const PASS_SCORE = 70;

/** Consecutive-day learning streak from completion timestamps (UTC days).
    A streak survives until a full day is skipped — finishing nothing today
    doesn't break it until tomorrow. */
function computeStreak(completedAt: string[], now = new Date()): number {
  const days = new Set(completedAt.map((t) => t.slice(0, 10)));
  const day = new Date(now);
  let streak = 0;
  // Today counts if present, but an empty today doesn't end the streak.
  if (!days.has(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() - 1);
  while (days.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}

type StoredLearnerProfile = {
  goal?: string;
  weekly_hours?: number;
  prior_level?: string;
  format_pref?: string;
  device?: string;
  device_power?: string;
  summary?: string;
};

export default async function ProfilePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: enrollments }, { data: completions }, { data: quizAttempts }, { data: certified }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, country, created_at")
        .eq("id", user.id)
        .single(),
      supabase
        .from("enrollments")
        .select("id, created_at, assessment_transcript, skills ( title )")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("lesson_completions")
        .select("lesson_id, completed_at")
        .eq("user_id", user.id),
      supabase
        .from("quiz_attempts")
        .select("quiz_id, score")
        .eq("user_id", user.id),
      supabase
        .from("checkpoint_submissions")
        .select("checkpoint_id, self_certified_at")
        .eq("user_id", user.id)
        .not("self_certified_at", "is", null),
    ]);

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "Learner";
  const initials = name
    .split(/\s+/)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-NG", { month: "long", year: "numeric" })
    : null;

  const streak = computeStreak((completions ?? []).map((c) => c.completed_at));
  const quizzesPassed = new Set(
    (quizAttempts ?? []).filter((a) => Number(a.score) >= PASS_SCORE).map((a) => a.quiz_id),
  ).size;
  const checkpointsDone = new Set((certified ?? []).map((c) => c.checkpoint_id)).size;

  // Per-skill progress: completed lessons vs. total lessons on each roadmap.
  const completedIds = new Set((completions ?? []).map((c) => c.lesson_id));
  const skillProgress = await Promise.all(
    (enrollments ?? []).map(async (e) => {
      const { data: levels } = await supabase
        .from("levels")
        .select("roadmaps!inner ( enrollment_id ), modules ( lessons ( id ) )")
        .eq("roadmaps.enrollment_id", e.id);
      const lessonIds = (levels ?? []).flatMap((l) =>
        (l.modules ?? []).flatMap((m) => (m.lessons ?? []).map((ls) => ls.id)),
      );
      const skillRel = e.skills;
      return {
        id: e.id,
        title:
          (Array.isArray(skillRel)
            ? skillRel[0]?.title
            : (skillRel as { title: string } | null)?.title) ?? "Untitled skill",
        total: lessonIds.length,
        done: lessonIds.filter((id) => completedIds.has(id)).length,
      };
    }),
  );

  // "How you learn" — from the most recent assessment.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const learner: StoredLearnerProfile =
    ((enrollments?.[0]?.assessment_transcript as any)?.profile as StoredLearnerProfile) ?? {};
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const learnerChips = [
    learner.goal && `Goal: ${learner.goal}`,
    learner.weekly_hours && `${learner.weekly_hours} hrs/week`,
    learner.prior_level && `Started as: ${learner.prior_level}`,
    learner.format_pref && `Prefers: ${learner.format_pref}`,
    learner.device &&
      learner.device !== "not_applicable" &&
      `Device: ${learner.device}${learner.device_power && !["not_applicable", "unknown"].includes(learner.device_power) ? ` (${learner.device_power}-power)` : ""}`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Identity */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-96 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
          <div className="glow-accent flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong font-display text-2xl font-bold text-accent-ink">
            {initials}
          </div>
          <div className="mt-4 min-w-0 flex-1 sm:mt-0">
            <h1 className="font-display truncate text-2xl font-bold">{name}</h1>
            <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
            <p className="mt-0.5 text-xs text-muted">
              {[profile?.country, memberSince && `learning since ${memberSince}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <ProfileEditor
              userId={user.id}
              initialName={profile?.display_name ?? ""}
              initialCountry={profile?.country ?? ""}
            />
          </div>
        </div>

        {learner.summary && (
          <p className="relative mt-5 rounded-2xl border border-border bg-surface-raised p-4 text-sm leading-relaxed text-muted">
            {learner.summary}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={completedIds.size} label="Lessons done" />
        <StatTile
          value={streak}
          label="Day streak"
          highlight={streak > 0}
          suffix={streak > 0 ? " 🔥" : ""}
        />
        <StatTile value={quizzesPassed} label="Quizzes passed" />
        <StatTile value={checkpointsDone} label="Checkpoints" />
      </div>

      {/* How you learn */}
      {learnerChips.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">How you learn</h2>
          <p className="mt-1 text-xs text-muted">
            From your assessment — it shapes every roadmap we build for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {learnerChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Your paths</h2>
          <Link
            href="/assessment"
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            + New skill
          </Link>
        </div>
        {skillProgress.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No skills yet —{" "}
            <Link href="/assessment" className="text-accent hover:underline">
              start your first roadmap
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {skillProgress.map((s) => {
              const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
              return (
                <li key={s.id}>
                  <Link
                    href={`/skills/${s.id}`}
                    className="card-lift block rounded-2xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display truncate text-sm font-semibold">
                        {s.title}
                      </p>
                      <span className="shrink-0 text-xs text-muted">
                        {s.done}/{s.total} · {pct}%
                      </span>
                    </div>
                    <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-accent/70 to-accent-strong"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({
  value,
  label,
  highlight = false,
  suffix = "",
}: {
  value: number;
  label: string;
  highlight?: boolean;
  suffix?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-center ${
        highlight ? "border-accent/40 bg-accent/[0.04]" : "border-border bg-surface"
      }`}
    >
      <p className="font-display text-2xl font-bold">
        {value}
        {suffix}
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
