"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "email" | "code";

/** Supabase auth errors can be cryptic or even empty ("{}"). Translate the
    common ones into something a learner can act on. */
function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").replace(/[{}]/g, "").trim();
  if (!m || /error sending|sending magic link|unexpected_failure/i.test(m)) {
    return "We couldn't send the email — the sender only allows a few sign-in emails per hour. Please wait ~1 hour and retry, or use 'Continue with Google' instead.";
  }
  if (/rate limit/i.test(m)) {
    return "Email limit reached — only a few sign-in emails can go out per hour. Wait a bit and retry, or use 'Continue with Google'.";
  }
  if (/invalid|expired/i.test(m) ) {
    return "That code is invalid or has expired — request a fresh one and try again.";
  }
  return m;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A skill carried from the landing page routes straight into the assessment.
  const skill = searchParams.get("skill");
  const nextParam = searchParams.get("next");
  // Only allow same-site relative paths (prevents open redirects).
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : skill
        ? `/assessment?skill=${encodeURIComponent(skill)}`
        : "/dashboard";

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
    }
    // On success the browser navigates away to Google.
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // The email contains both a 6-digit code and a sign-in link; the
        // link completes auth through our callback route.
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error.message));
    } else {
      setStage("code");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
    } else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        onClick={signInWithGoogle}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised text-sm font-medium transition-colors hover:border-accent disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>

      {stage === "email" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-xl border border-border bg-surface-raised px-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <p className="text-sm text-muted">
            We emailed{" "}
            <span className="text-foreground">{email}</span>. Open it{" "}
            <span className="text-foreground">
              in this browser and click the sign-in link
            </span>
            — or if the email shows a 6-digit code, enter it below.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="h-11 w-full rounded-xl border border-border bg-surface-raised px-4 text-center text-lg tracking-[0.4em] placeholder:text-sm placeholder:tracking-normal placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            onClick={() => setStage("email")}
            className="w-full text-center text-xs text-muted hover:text-foreground"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.1 3.5-5.1 3.5-8.6"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2a7.2 7.2 0 0 1-6.8-5l-.14.01-3.7 2.8-.05.13A12 12 0 0 0 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4a7.4 7.4 0 0 1 0-4.7l-.01-.16-3.7-2.9-.12.06a12 12 0 0 0 0 10.7l3.8-3"
      />
      <path
        fill="#EB4335"
        d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0A12 12 0 0 0 1.3 6.7l3.9 3a7.2 7.2 0 0 1 6.8-5"
      />
    </svg>
  );
}
