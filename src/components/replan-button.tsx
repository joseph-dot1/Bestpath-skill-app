"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-tap replan: rebuilds the weekly plan from remaining lessons starting
 * today. Shown wherever a learner is behind their plan.
 */
export function ReplanButton({
  enrollmentId,
  compact = false,
}: {
  enrollmentId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function replan() {
    setBusy(true);
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/replan`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={replan}
      disabled={busy}
      className={
        compact
          ? "rounded-full border border-amber-400/40 px-4 py-2 text-xs text-amber-300 transition-colors hover:border-amber-300 disabled:opacity-50"
          : "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
      }
    >
      {busy ? "Replanning…" : "Replan my weeks"}
    </button>
  );
}

export function BehindBanner({ enrollmentId }: { enrollmentId: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/5 px-4 py-3">
      <p className="text-sm text-amber-200">
        Life happened? You&apos;re behind the plan — reset it around what&apos;s
        left. No guilt, just a fresh week one.
      </p>
      <ReplanButton enrollmentId={enrollmentId} />
    </div>
  );
}
