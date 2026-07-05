"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AssessmentQuestion,
  AssessmentTurn,
  LearnerProfile,
} from "@/lib/assessment/engine";

const MAX_QUESTIONS = 8;

type Phase =
  | { name: "loading" } // waiting on the next question
  | { name: "question"; question: AssessmentQuestion }
  | { name: "enrolling"; profile: LearnerProfile }
  | { name: "error"; message: string };

export function AssessmentFlow({
  skillKey,
  skillTitle,
}: {
  skillKey: string;
  skillTitle: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [transcript, setTranscript] = useState<AssessmentTurn[]>([]);
  const [freeText, setFreeText] = useState("");
  const startedRef = useRef(false);

  const enroll = useCallback(
    async (turns: AssessmentTurn[], profile: LearnerProfile) => {
      try {
        const res = await fetch("/api/enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill: skillKey, profile, transcript: turns }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPhase({ name: "error", message: data.error ?? "Could not save your profile" });
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch {
        setPhase({ name: "error", message: "Network error while saving — retry." });
      }
    },
    [router, skillKey],
  );

  const fetchStep = useCallback(
    async (turns: AssessmentTurn[]) => {
      setPhase({ name: "loading" });
      try {
        const res = await fetch("/api/assessment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillTitle, transcript: turns }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPhase({ name: "error", message: data.error ?? "Request failed" });
          return;
        }
        if (data.action === "ask") {
          setPhase({ name: "question", question: data.question });
        } else {
          setPhase({ name: "enrolling", profile: data.profile });
          await enroll(turns, data.profile);
        }
      } catch {
        setPhase({ name: "error", message: "Network error — check your connection and retry." });
      }
    },
    [skillTitle, enroll],
  );

  // Kick off the first question exactly once.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      fetchStep([]);
    }
  }, [fetchStep]);

  function answer(text: string) {
    if (phase.name !== "question" || !text.trim()) return;
    const turns = [...transcript, { question: phase.question.text, answer: text.trim() }];
    setTranscript(turns);
    setFreeText("");
    fetchStep(turns);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-8">
      {/* Header + progress dots */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted">
          Building your roadmap
        </p>
        <h1 className="font-display mt-1 text-xl font-bold">{skillTitle}</h1>
        <div className="mt-4 flex justify-center gap-1.5">
          {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-5 rounded-full transition-colors ${
                i < transcript.length ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-10">
        {phase.name === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
            <Spinner />
            {transcript.length === 0 ? "Preparing your first question…" : "Thinking…"}
          </div>
        )}

        {phase.name === "question" && (
          <div>
            <p className="text-center text-lg leading-relaxed">
              {phase.question.text}
            </p>
            <div className="mt-6 space-y-2">
              {phase.question.options.map((option) => (
                <button
                  key={option}
                  onClick={() => answer(option)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-accent"
                >
                  {option}
                </button>
              ))}
            </div>
            {(phase.question.allow_free_text ||
              phase.question.options.length === 0) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  answer(freeText);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={
                    phase.question.options.length > 0
                      ? "Or type your own answer…"
                      : "Type your answer…"
                  }
                  className="h-11 flex-1 rounded-xl border border-border bg-surface px-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        )}

        {phase.name === "enrolling" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
            <Spinner />
            <p>
              Got it — saving your learner profile…
            </p>
          </div>
        )}

        {phase.name === "error" && (
          <div className="rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="text-sm text-red-400">{phase.message}</p>
            <button
              onClick={() => fetchStep(transcript)}
              className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
      aria-label="Loading"
    />
  );
}
