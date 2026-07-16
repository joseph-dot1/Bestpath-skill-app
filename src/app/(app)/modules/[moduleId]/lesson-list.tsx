"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ResourceData = {
  id: string;
  kind: string;
  url: string;
  title: string;
  channel: string | null;
  stats: { views?: number; duration_s?: number };
  publishedAt: string | null;
};

export type LessonWithResources = {
  id: string;
  title: string;
  summary: string | null;
  completed: boolean;
  resources: ResourceData[];
};

function formatViews(views?: number) {
  if (!views) return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export function LessonList({
  lessons,
  prefetchModuleId,
}: {
  lessons: LessonWithResources[];
  prefetchModuleId: string | null;
}) {
  // Hydrate the next module one step ahead, silently.
  useEffect(() => {
    if (prefetchModuleId) {
      fetch(`/api/modules/${prefetchModuleId}/hydrate`, { method: "POST" }).catch(
        () => {},
      );
    }
  }, [prefetchModuleId]);

  return (
    <ol className="mt-6 space-y-5">
      {lessons.map((lesson, i) => (
        <LessonCard key={lesson.id} lesson={lesson} number={i + 1} />
      ))}
    </ol>
  );
}

export function QuizCta({ moduleId }: { moduleId: string }) {
  return (
    <a
      href={`/modules/${moduleId}/quiz`}
      className="card-lift mt-6 block rounded-2xl border border-accent/40 bg-surface p-4 text-center"
    >
      <p className="font-display text-sm font-semibold">
        Finished the lessons? <span className="text-accent">Take the quiz →</span>
      </p>
      <p className="mt-1 text-xs text-muted">
        3-5 quick questions — active recall locks it in.
      </p>
    </a>
  );
}

function LessonCard({
  lesson,
  number,
}: {
  lesson: LessonWithResources;
  number: number;
}) {
  const [completed, setCompleted] = useState(lesson.completed);

  async function toggleComplete() {
    const next = !completed;
    setCompleted(next); // optimistic
    try {
      const res = await fetch(`/api/lessons/${lesson.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      if (!res.ok) setCompleted(!next);
    } catch {
      setCompleted(!next);
    }
  }

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 transition-colors ${
        completed ? "border-accent/40 bg-accent/[0.03]" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={toggleComplete}
          aria-label={completed ? "Mark lesson incomplete" : "Mark lesson complete"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold transition-colors ${
            completed
              ? "border-accent bg-accent text-accent-ink"
              : "border-border text-transparent hover:border-accent"
          }`}
        >
          ✓
        </button>
        <div className="min-w-0">
          <h2
            className={`text-sm font-semibold ${completed ? "text-muted line-through" : ""}`}
          >
            <span className="text-accent">{number}.</span> {lesson.title}
          </h2>
          {lesson.summary && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {lesson.summary}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {lesson.resources.length === 0 && (
          <p className="text-xs text-muted">
            No verified resources yet for this lesson — check back soon.
          </p>
        )}
        {lesson.resources.map((r) => (
          <ResourceCard key={r.id} resource={r} lessonId={lesson.id} />
        ))}
        {lesson.resources.length > 0 && (
          <p className="pt-1 text-[11px] text-muted">
            Watched one? Rate it — 👍 promotes it, 👎 swaps in a better video.
            Your ratings improve the picks for every learner.
          </p>
        )}
      </div>
    </li>
  );
}

function ResourceCard({
  resource,
  lessonId,
}: {
  resource: ResourceData;
  lessonId: string;
}) {
  const router = useRouter();
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const [swapping, setSwapping] = useState(false);

  async function sendVote(v: 1 | -1) {
    if (vote === v) return;
    setVote(v);
    if (v === -1) setSwapping(true);
    try {
      const res = await fetch(`/api/resources/${resource.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: v, lessonId }),
      });
      if (v === -1 && res.ok) {
        // The server already swapped in a replacement — re-render with it.
        router.refresh();
      }
    } catch {
      // Non-fatal; the vote can be retried.
    } finally {
      setSwapping(false);
    }
  }

  const isVideo = resource.kind === "youtube";
  const meta = [
    resource.channel,
    formatViews(resource.stats.views),
    formatDuration(resource.stats.duration_s),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 transition-[opacity,border-color] hover:border-accent/40 ${
        swapping ? "opacity-40" : ""
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm ${
          isVideo ? "bg-accent/10 text-accent" : "bg-surface text-muted"
        }`}
        aria-hidden
      >
        {isVideo ? "▶" : "📄"}
      </span>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1"
      >
        <p className="truncate text-sm font-medium hover:text-accent">
          {resource.title}
        </p>
        {meta && <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>}
      </a>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => sendVote(1)}
          aria-label="This video helped me"
          title="This video helped me — show it to more learners"
          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
            vote === 1
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:border-accent hover:text-foreground"
          }`}
        >
          {vote === 1 ? "👍 Thanks!" : "👍 Helped"}
        </button>
        <button
          onClick={() => sendVote(-1)}
          aria-label="Not good — replace this video"
          title="Not good — swap in a better video for everyone"
          disabled={swapping}
          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
            vote === -1
              ? "border-red-400/50 bg-red-400/10 text-red-300"
              : "border-border text-muted hover:border-red-400/50"
          }`}
        >
          {swapping ? "Swapping…" : "👎 Replace"}
        </button>
      </div>
    </div>
  );
}
