"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  pay_beginner: string;
  pay_experienced: string;
  demand_outlook: string;
  ai_impact: string;
  trends: string[];
};

/**
 * "Market snapshot" for a skill — pay ranges, demand, AI impact, trends.
 * Loads (and lazily generates + caches) from the market API on mount.
 * Shown on the skill roadmap page to motivate and set expectations.
 */
export function MarketSnapshot({ skillId }: { skillId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/skills/${skillId}/market`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          return;
        }
        setSnapshot(await res.json());
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  if (state === "error") return null; // fail quietly — it's a bonus, not core

  return (
    <section className="mx-auto mt-8 w-full max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Market snapshot</h2>
        <span className="text-xs text-muted">pay · demand · AI outlook</span>
      </div>

      {state === "loading" || !snapshot ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          Checking the latest on pay and demand…
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <PayCard label="Beginner pay" value={snapshot.pay_beginner} />
            <PayCard label="Experienced pay" value={snapshot.pay_experienced} />
          </div>

          <InfoCard title="📈 Demand" body={snapshot.demand_outlook} />
          <InfoCard title="🤖 AI & the future of this skill" body={snapshot.ai_impact} />

          {snapshot.trends.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Worth knowing right now
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {snapshot.trends.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-center text-[11px] text-muted">
            Figures are realistic estimates, not guarantees — they move with
            experience, niche, and clients.
          </p>
        </div>
      )}
    </section>
  );
}

function PayCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-surface p-4">
      <span
        aria-hidden
        className="font-display pointer-events-none absolute -bottom-4 -right-1 text-7xl font-bold text-accent/5"
      >
        ₦
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
