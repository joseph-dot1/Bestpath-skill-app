import Link from "next/link";

/** Wordmark + mark: a winding path that ends at a lime waypoint. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:rotate-6"
      >
        <path
          d="M3.5 20c5.5 0 4.5-8 9.5-8 3.5 0 3.5-5.5 6.5-6.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="20" cy="5" r="3" fill="var(--accent)" />
      </svg>
      <span>
        best<span className="text-accent">path</span>
      </span>
    </Link>
  );
}
