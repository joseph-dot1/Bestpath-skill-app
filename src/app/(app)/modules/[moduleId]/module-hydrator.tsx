"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_LINES = [
  "Mapping lessons to topics…",
  "Searching YouTube…",
  "Verifying every video is real and worth your time…",
  "Ranking by quality and relevance…",
  "Checking written resources…",
];

/**
 * Shown when a module hasn't been hydrated yet. Kicks off hydration (or polls
 * an in-flight one) and reloads the page when the resources are ready.
 */
export function ModuleHydrator({
  moduleId,
  moduleTitle,
  alreadyRunning,
}: {
  moduleId: string;
  moduleTitle: string;
  alreadyRunning: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(-1);

  // Rotate status copy while the pipeline runs (it can take ~30-90s on a
  // cold topic pool; instant on a warm one).
  useEffect(() => {
    const t = setInterval(
      () => setLineIndex((i) => (i + 1) % STATUS_LINES.length),
      4000,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;
    let cancelled = false;

    async function run() {
      setError(null);
      try {
        const res = await fetch(`/api/modules/${moduleId}/hydrate`, {
          method: "POST",
        });
        if (cancelled) return;

        if (res.status === 202 || alreadyRunning) {
          // Someone else is hydrating — poll until done.
          const poll = setInterval(async () => {
            const check = await fetch(`/api/modules/${moduleId}/hydrate`, {
              method: "POST",
            });
            if (check.ok) {
              const data = await check.json();
              if (data.status === "hydrated") {
                clearInterval(poll);
                router.refresh();
              }
            }
          }, 4000);
          return;
        }

        const data = await res.json().catch(() => null);
        if (res.ok && data?.status === "hydrated") {
          router.refresh();
        } else {
          setError(data?.error ?? "Curation failed — retry.");
        }
      } catch {
        if (!cancelled) setError("Connection lost — retry.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [attempt, moduleId, alreadyRunning, router]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-16 text-center">
      <h1 className="font-display text-xl font-bold">{moduleTitle}</h1>
      {!error ? (
        <>
          <span className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="mt-4 text-sm text-muted transition-opacity">
            {STATUS_LINES[lineIndex]}
          </p>
          <p className="mt-6 max-w-xs text-xs text-muted">
            First visit to a topic takes a minute — we verify every link live
            before showing it to you. It&apos;s instant after that.
          </p>
        </>
      ) : (
        <div className="mt-8 w-full rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
