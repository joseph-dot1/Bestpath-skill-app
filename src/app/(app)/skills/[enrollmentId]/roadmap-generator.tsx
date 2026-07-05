"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SkeletonLevel } from "@/lib/roadmap/generator";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "level"; level: SkeletonLevel; index: number }
  | { type: "done"; roadmapId: string }
  | { type: "error"; message: string };

export function RoadmapGenerator({
  enrollmentId,
  skillTitle,
}: {
  enrollmentId: string;
  skillTitle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Designing your roadmap…");
  const [levels, setLevels] = useState<SkeletonLevel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(-1);

  useEffect(() => {
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;

    let cancelled = false;

    async function run() {
      setError(null);
      try {
        const res = await fetch("/api/roadmaps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollmentId }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          if (!cancelled) setError(data?.error ?? "Generation failed — retry.");
          return;
        }

        // Parse the SSE stream: lines of `data: {json}` separated by \n\n.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            if (!chunk.startsWith("data: ")) continue;

            const evt = JSON.parse(chunk.slice(6)) as StreamEvent;
            if (cancelled) return;

            if (evt.type === "status") setStatus(evt.message);
            else if (evt.type === "level")
              setLevels((prev) => [...prev, evt.level]);
            else if (evt.type === "error") setError(evt.message);
            else if (evt.type === "done") {
              setStatus("Ready!");
              router.refresh();
              return;
            }
          }
        }
      } catch {
        if (!cancelled) setError("Connection lost — retry.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [attempt, enrollmentId, router]);

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted">
          Your roadmap
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold">{skillTitle}</h1>
        {!error && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
            {status}
          </p>
        )}
      </div>

      {error && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {/* Levels appear one by one as the model finishes them. */}
      <ol className="mt-8 space-y-4">
        {levels.map((level, i) => (
          <li
            key={i}
            className="animate-[fadeIn_0.5s_ease-out] rounded-2xl border border-border bg-surface p-5"
          >
            <div className="flex items-center gap-3">
              <span className="font-display text-sm font-bold text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-display font-semibold">{level.name}</h2>
              <span className="ml-auto text-xs text-muted">
                {level.modules.length} modules
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {level.modules.map((m) => (
                <li key={m.title} className="text-sm text-muted">
                  • {m.title}
                  <span className="text-xs"> — ~{m.est_hours}h</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
