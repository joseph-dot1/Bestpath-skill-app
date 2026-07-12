"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Inline editor for the profile's display name + country (RLS-guarded). */
export function ProfileEditor({
  userId,
  initialName,
  initialCountry,
}: {
  userId: string;
  initialName: string;
  initialCountry: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState(initialCountry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: trimmed, country: country.trim() || null })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
      >
        Edit profile
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 w-full max-w-xs space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="Your name"
        autoFocus
        className="h-10 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
      />
      <input
        type="text"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        maxLength={60}
        placeholder="Country (optional)"
        className="h-10 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-9 flex-1 rounded-xl bg-accent text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(initialName);
            setCountry(initialCountry);
            setError(null);
          }}
          className="h-9 rounded-xl border border-border px-4 text-xs text-muted hover:border-accent hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
