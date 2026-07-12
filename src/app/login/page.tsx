import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-[30rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="animate-fade-in relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[0_16px_48px_-16px_rgb(0_0_0/0.6)]">
          <h1 className="font-display text-xl font-bold">Welcome</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to start your roadmap. No password needed.
          </p>
          {isSupabaseConfigured ? (
            <Suspense>
              <LoginForm />
            </Suspense>
          ) : (
            <p className="mt-6 rounded-xl border border-border bg-surface-raised p-4 text-sm text-muted">
              Supabase isn&apos;t configured yet. Copy{" "}
              <code className="text-accent">.env.example</code> to{" "}
              <code className="text-accent">.env.local</code> and add your
              project keys — see the README.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
