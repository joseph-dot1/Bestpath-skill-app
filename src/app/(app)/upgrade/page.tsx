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
      <p className="text-xs uppercase tracking-widest text-accent">
        Bestpath Pro
      </p>
      <h1 className="font-display mt-2 text-2xl font-bold">
        Go beyond Beginner
      </h1>
      <p className="mt-2 text-sm text-muted">
        Your Beginner level is free forever. Pro unlocks the rest of the path.
      </p>

      <div className="mt-8 w-full rounded-2xl border border-accent/40 bg-surface p-6 text-left">
        <ul className="space-y-2.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex gap-2 text-sm">
              <span className="text-accent">✓</span>
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
