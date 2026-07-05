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

function LessonCard({
  lesson,
  number,
}: {
  lesson: LessonWithResources;
  number: number;
}) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="font-display mt-0.5 text-sm font-bold text-accent">
          {number}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{lesson.title}</h2>
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
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 transition-opacity ${
        swapping ? "opacity-40" : ""
      }`}
    >
      <span className="shrink-0 text-lg" aria-hidden>
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
          aria-label="This resource was helpful"
          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
            vote === 1
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:border-accent hover:text-foreground"
          }`}
        >
          👍
        </button>
        <button
          onClick={() => sendVote(-1)}
          aria-label="Replace this resource"
          disabled={swapping}
          className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
            vote === -1
              ? "border-red-400/50 bg-red-400/10"
              : "border-border text-muted hover:border-red-400/50"
          }`}
        >
          👎
        </button>
      </div>
    </div>
  );
}
