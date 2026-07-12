"use client";

import { useEffect, useState } from "react";

type ToolkitItem = {
  slug: string;
  title: string;
  why: string | null;
  resources: { id: string; title: string; url: string; channel: string | null }[];
};

/**
 * "Professional toolkit" — the optional adjacent competencies working
 * professionals in this field rely on (time management, client comms,
 * pricing…). Generated once per skill, cached, shared by all learners.
 */
export function ProfessionalToolkit({ skillId }: { skillId: string }) {
  const [items, setItems] = useState<ToolkitItem[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/skills/${skillId}/toolkit`, { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = await res.json();
        setItems(data.items ?? []);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  if (state === "error" || (state === "ready" && (items?.length ?? 0) === 0)) {
    return null; // optional by design — never block or clutter the roadmap
  }

  return (
    <section className="mx-auto mt-10 w-full max-w-2xl">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          Professional toolkit{" "}
          <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted">
            Optional
          </span>
        </h2>
        <span className="text-xs text-muted">what working pros lean on</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Beyond the craft itself — the skills that make people actually hire
        (and re-hire) you.
      </p>

      {state === "loading" ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          Assembling your toolkit…
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items!.map((item) => (
            <div
              key={item.slug}
              className="card-lift rounded-2xl border border-border bg-surface p-4"
            >
              <p className="font-display text-sm font-semibold">{item.title}</p>
              {item.why && (
                <p className="mt-1 text-xs leading-relaxed text-muted">{item.why}</p>
              )}
              <div className="mt-3 space-y-1.5">
                {item.resources.length === 0 ? (
                  <p className="text-xs text-muted">Videos coming soon.</p>
                ) : (
                  item.resources.map((r) => (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 transition-colors hover:border-accent/40"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[10px] text-accent">
                        ▶
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {r.title}
                        </span>
                        {r.channel && (
                          <span className="block truncate text-[11px] text-muted">
                            {r.channel}
                          </span>
                        )}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
