import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-display text-lg font-bold tracking-tight text-foreground"
    >
      best<span className="text-accent">path</span>
    </Link>
  );
}
