"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CheckpointFeedback } from "@/lib/learning/types";

type Checkpoint = { id: string; brief: string; rubric: string[] };

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "brief" }
  | { name: "reviewing" }
  | { name: "feedback"; submissionId: string; feedback: CheckpointFeedback }
  | { name: "certified" };

const ASSESSMENT_ICON: Record<string, string> = {
  met: "✅",
  partial: "🟡",
  not_evident: "⚪",
};

export function CheckpointFlow({
  levelId,
  levelName,
  enrollmentId,
}: {
  levelId: string;
  levelName: string;
  enrollmentId: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(-1);

  useEffect(() => {
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;
    let cancelled = false;

    (async () => {
      setPhase({ name: "loading" });
      try {
        const res = await fetch(`/api/levels/${levelId}/checkpoint`, {
          method: "POST",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPhase({ name: "error", message: data.error ?? "Could not load checkpoint" });
          return;
        }
        setCheckpoint(data);
        setPhase({ name: "brief" });
      } catch {
        if (!cancelled) setPhase({ name: "error", message: "Network error — retry." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, levelId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkpoint) return;
    setPhase({ name: "reviewing" });
    try {
      const res = await fetch(`/api/checkpoints/${checkpoint.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, mediaUrl: mediaUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "brief" });
        alert(data.error ?? "Submission failed — try again.");
        return;
      }
      setPhase({
        name: "feedback",
        submissionId: data.submissionId,
        feedback: data.feedback,
      });
    } catch {
      setPhase({ name: "brief" });
      alert("Network error — try again.");
    }
  }

  async function certify(submissionId: string) {
    try {
      const res = await fetch(`/api/submissions/${submissionId}/certify`, {
        method: "POST",
      });
      if (res.ok) setPhase({ name: "certified" });
    } catch {
      // retryable
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg py-6">
      {enrollmentId && (
        <Link
          href={`/skills/${enrollmentId}`}
          className="text-xs text-muted hover:text-foreground"
        >
          ← Back to roadmap
        </Link>
      )}
      <p className="mt-3 text-xs uppercase tracking-widest text-muted">
        Prove it · {levelName} checkpoint
      </p>

      {phase.name === "loading" && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          Designing your project…
        </div>
      )}

      {phase.name === "error" && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm text-red-400">{phase.message}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted hover:border-accent hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {checkpoint && (phase.name === "brief" || phase.name === "reviewing") && (
        <div className="mt-4">
          <h1 className="font-display text-xl font-bold">Your project</h1>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {checkpoint.brief}
          </p>

          <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Your work should show
            </p>
            <ul className="mt-2 space-y-1.5">
              {checkpoint.rubric.map((r) => (
                <li key={r} className="text-sm text-foreground">
                  ▸ {r}
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <textarea
              required
              minLength={30}
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you built and how — what you made, the choices you took, what was hard, what you'd do differently…"
              className="w-full rounded-xl border border-border bg-surface p-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="Optional: link to your work (Drive, YouTube, GitHub…)"
              className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={phase.name === "reviewing"}
              className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-50"
            >
              {phase.name === "reviewing" ? "Getting your feedback…" : "Get feedback"}
            </button>
          </form>
        </div>
      )}

      {phase.name === "feedback" && (
        <div className="mt-4">
          <h1 className="font-display text-xl font-bold">Feedback</h1>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {phase.feedback.overall_feedback}
          </p>

          <div className="mt-5 space-y-2">
            {phase.feedback.rubric_assessment.map((r) => (
              <div
                key={r.criterion}
                className="rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm">
                  {ASSESSMENT_ICON[r.assessment] ?? "⚪"} {r.criterion}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{r.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-center">
            <p className="text-sm text-muted">
              You decide when you&apos;re ready — the feedback is a mirror, not
              a gate.
            </p>
            <button
              onClick={() => certify(phase.submissionId)}
              className="mt-3 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
            >
              I&apos;m ready — mark this level complete
            </button>
            <button
              onClick={() => setPhase({ name: "brief" })}
              className="mt-2 w-full text-xs text-muted hover:text-foreground"
            >
              Improve my work first and resubmit
            </button>
          </div>
        </div>
      )}

      {phase.name === "certified" && (
        <div className="mt-10 rounded-2xl border border-accent/40 bg-surface p-6 text-center">
          <p className="text-3xl">🎉</p>
          <h1 className="font-display mt-2 text-xl font-bold">
            {levelName} level — done.
          </h1>
          <p className="mt-2 text-sm text-muted">
            That&apos;s real, provable progress. On to the next level.
          </p>
          {enrollmentId && (
            <Link
              href={`/skills/${enrollmentId}`}
              className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
            >
              Back to my roadmap
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
