"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QUIZ_PASS_THRESHOLD, type QuizQuestion } from "@/lib/learning/types";

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "quiz" }
  | { name: "done" };

export function QuizFlow({
  moduleId,
  moduleTitle,
}: {
  moduleId: string;
  moduleTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(-1);

  useEffect(() => {
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;
    let cancelled = false;

    (async () => {
      setPhase({ name: "loading" });
      try {
        const res = await fetch(`/api/modules/${moduleId}/quiz`, { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPhase({ name: "error", message: data.error ?? "Could not load quiz" });
          return;
        }
        setQuizId(data.quizId);
        setQuestions(data.questions);
        setPhase({ name: "quiz" });
      } catch {
        if (!cancelled) setPhase({ name: "error", message: "Network error — retry." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, moduleId]);

  const correctCount = answers.filter(
    (a, i) => a === questions[i]?.correct_index,
  ).length;
  const score = questions.length > 0 ? correctCount / questions.length : 0;

  function pick(optionIndex: number) {
    if (picked !== null) return; // already answered — showing feedback
    setPicked(optionIndex);
  }

  async function next() {
    const newAnswers = [...answers, picked ?? -1];
    setAnswers(newAnswers);
    setPicked(null);
    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      setPhase({ name: "done" });
      const finalScore =
        newAnswers.filter((a, i) => a === questions[i]?.correct_index).length /
        questions.length;
      // Fire-and-forget attempt save.
      fetch("/api/quiz-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, answers: newAnswers, score: finalScore }),
      }).catch(() => {});
    }
  }

  const q = questions[current];

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <p className="text-center text-xs uppercase tracking-widest text-muted">
        Quiz · {moduleTitle}
      </p>

      {phase.name === "loading" && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          Writing your quiz…
        </div>
      )}

      {phase.name === "error" && (
        <div className="mt-10 rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm text-red-400">{phase.message}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted hover:border-accent hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {phase.name === "quiz" && q && (
        <div className="mt-8">
          <div className="flex justify-center gap-1.5">
            {questions.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i < current ? "bg-accent" : i === current ? "bg-accent/50" : "bg-border"
                }`}
              />
            ))}
          </div>

          <p className="mt-6 text-center text-lg leading-relaxed">{q.question}</p>

          <div className="mt-6 space-y-2">
            {q.options.map((option, i) => {
              const isCorrect = i === q.correct_index;
              const isPicked = i === picked;
              const revealed = picked !== null;
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={revealed}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    revealed && isCorrect
                      ? "border-accent bg-accent/10"
                      : revealed && isPicked
                        ? "border-red-400/60 bg-red-400/10"
                        : "border-border bg-surface hover:border-accent"
                  } ${revealed && !isCorrect && !isPicked ? "opacity-50" : ""}`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {picked !== null && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm">
                {picked === q.correct_index ? "✅ Correct!" : "❌ Not quite."}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {q.explanation}
              </p>
              <button
                onClick={next}
                className="mt-3 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
              >
                {current + 1 < questions.length ? "Next question" : "See my score"}
              </button>
            </div>
          )}
        </div>
      )}

      {phase.name === "done" && (
        <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-display text-4xl font-bold text-accent">
            {correctCount}/{questions.length}
          </p>
          <p className="mt-2 text-sm text-muted">
            {score >= QUIZ_PASS_THRESHOLD
              ? "Solid — you've got this module. Keep the momentum going."
              : "Worth revisiting the resources above before moving on — active recall works best on a second pass."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/modules/${moduleId}`}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:border-accent hover:text-foreground"
            >
              Back to module
            </Link>
            {score < QUIZ_PASS_THRESHOLD && (
              <button
                onClick={() => {
                  setAnswers([]);
                  setCurrent(0);
                  setPicked(null);
                  setPhase({ name: "quiz" });
                }}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
