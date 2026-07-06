import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <p className="font-display text-5xl font-bold text-accent">404</p>
        <h1 className="font-display mt-3 text-xl font-bold">
          This path doesn&apos;t exist
        </h1>
        <p className="mt-2 max-w-xs text-sm text-muted">
          The page you&apos;re looking for was moved or never existed.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
        >
          Back to my dashboard
        </Link>
      </main>
    </div>
  );
}
