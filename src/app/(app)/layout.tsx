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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
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
