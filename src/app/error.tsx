"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <p className="text-3xl">😵</p>
      <h1 className="font-display mt-3 text-xl font-bold">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-xs text-sm text-muted">
        That&apos;s on us, not you. Try again — if it keeps happening, your
        progress is safe and waiting.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
      >
        Try again
      </button>
    </div>
  );
}
