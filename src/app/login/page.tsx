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
      <main className="flex flex-1 items-center justify-center px-5 pb-24">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
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
