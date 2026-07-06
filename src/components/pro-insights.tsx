import Link from "next/link";

export type Insight = {
  id: string;
  author_name: string;
  author_title: string;
  format: "text" | "video_link" | "audio_link";
  body: string;
  is_premium: boolean;
};

/**
 * "Pro Insights" — curated advice from verified working professionals; the
 * stuff that's not commonly taught online. Premium items render locked for
 * free-tier learners (the body never reaches the client for those).
 */
export function ProInsights({
  insights,
  isPro,
}: {
  insights: Insight[];
  isPro: boolean;
}) {
  if (insights.length === 0) return null;

  return (
    <section className="mx-auto mt-12 w-full max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Pro Insights</h2>
        <span className="text-xs text-muted">from working professionals</span>
      </div>

      <div className="mt-4 space-y-3">
        {insights.map((insight) => {
          const lockedItem = insight.is_premium && !isPro;
          return (
            <div
              key={insight.id}
              className={`rounded-2xl border bg-surface p-4 ${
                insight.is_premium ? "border-accent/30" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-sm">
                  {insight.author_name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {insight.author_name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {insight.author_title}
                  </p>
                </div>
                {insight.is_premium && (
                  <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Premium
                  </span>
                )}
              </div>

              {lockedItem ? (
                <Link href="/upgrade" className="mt-3 block">
                  <p className="text-sm text-muted blur-[4px] select-none">
                    The part nobody tells beginners: the first three clients
                    never come from where you think they will…
                  </p>
                  <p className="mt-2 text-xs font-semibold text-accent">
                    🔓 Unlock with Pro →
                  </p>
                </Link>
              ) : insight.format === "text" ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {insight.body}
                </p>
              ) : (
                <a
                  href={insight.body}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-sm text-accent hover:underline"
                >
                  {insight.format === "video_link" ? "▶ Watch" : "🎧 Listen"}:{" "}
                  {insight.body}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
