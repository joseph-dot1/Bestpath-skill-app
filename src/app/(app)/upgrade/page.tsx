import Link from "next/link";

export const metadata = { title: "Upgrade" };

const PRO_FEATURES = [
  "Every level unlocked — Intermediate, Advanced, and Professional",
  "Unlimited skills and roadmaps",
  "Premium Pro Insights from working professionals",
  "AI coach inside every module (coming soon)",
];

// Payments (Paystack primary, Stripe secondary) land in v1.1 — this page is
// the gate they'll plug into.
export default function UpgradePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-10 text-center">
      <p className="rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1 text-xs uppercase tracking-widest text-accent">
        Bestpath Pro
      </p>
      <h1 className="font-display mt-3 text-2xl font-bold sm:text-3xl">
        Go beyond <span className="text-gradient-accent">Beginner</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        Your Beginner level is free forever. Pro unlocks the rest of the path.
      </p>

      <div className="relative mt-8 w-full overflow-hidden rounded-3xl border border-accent/40 bg-surface p-6 text-left">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-32 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl"
        />
        <ul className="relative space-y-2.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
        <button
          disabled
          className="mt-6 h-11 w-full cursor-not-allowed rounded-xl bg-accent/50 text-sm font-semibold text-accent-ink"
        >
          Payments launching soon
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          We&apos;re putting the finishing touches on Paystack checkout.
          Keep learning — your free level isn&apos;t going anywhere.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="mt-6 text-xs text-muted hover:text-foreground"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
