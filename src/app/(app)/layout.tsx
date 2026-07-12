import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

// Always render per-request: these pages depend on the auth session cookie.
export const dynamic = "force-dynamic";

// Shell for signed-in pages (dashboard, assessment, roadmap, admin).
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name ?? user.email ?? "there";
  const initials = name
    .split(/\s+/)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-5">
            <Logo href="/dashboard" />
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-muted transition-colors hover:text-foreground"
              >
                Home
              </Link>
              <Link
                href="/dashboard"
                className="text-muted transition-colors hover:text-foreground"
              >
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="group flex items-center gap-2"
              title="Your profile"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-[10px] font-bold text-accent-ink transition-transform group-hover:scale-110">
                {initials}
              </span>
              <span className="hidden text-sm text-muted transition-colors group-hover:text-foreground sm:inline">
                {name}
              </span>
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}
