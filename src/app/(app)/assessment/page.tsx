import Link from "next/link";
import { SEED_SKILLS } from "@/lib/seed-skills";

export const metadata = { title: "Assessment" };

// Placeholder — the adaptive assessment ships in Milestone 1.
export default async function AssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const { skill } = await searchParams;
  const chosen = SEED_SKILLS.find((s) => s.slug === skill);

  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl">
        ✍️
      </div>
      <h1 className="font-display mt-6 text-2xl font-bold">
        {chosen ? `Learning ${chosen.title}` : "Assessment"}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The adaptive assessment is under construction (Milestone 1). It will
        ask 5–8 questions and build your personalized roadmap.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
