"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SkillOption = { id: string; title: string };
type InsightRow = {
  id: string;
  author_name: string;
  author_title: string;
  is_premium: boolean;
  published: boolean;
  skillTitle: string;
};

// Admin writes go straight through the browser client — RLS `is_admin()`
// policies enforce access, so no bespoke API route is needed.
export function InsightManager({
  skills,
  insights,
}: {
  skills: SkillOption[];
  insights: InsightRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(formData: FormData) {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const publishNow = formData.get("publish") === "on";
    const { error } = await supabase.from("pro_insights").insert({
      skill_id: formData.get("skill_id"),
      author_name: formData.get("author_name"),
      author_title: formData.get("author_title"),
      format: formData.get("format"),
      body: formData.get("body"),
      is_premium: formData.get("is_premium") === "on",
      published_at: publishNow ? new Date().toISOString() : null,
    });
    setBusy(false);
    if (error) {
      setMessage(`Failed: ${error.message}`);
    } else {
      setMessage(publishNow ? "Published ✓" : "Saved as draft ✓");
      router.refresh();
    }
  }

  async function togglePublish(id: string, published: boolean) {
    const supabase = createClient();
    await supabase
      .from("pro_insights")
      .update({ published_at: published ? null : new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <form
        action={create}
        className="space-y-3 rounded-2xl border border-border bg-surface p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            name="skill_id"
            required
            className="h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm"
          >
            <option value="">Skill…</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <select
            name="format"
            required
            defaultValue="text"
            className="h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm"
          >
            <option value="text">Text</option>
            <option value="video_link">Video link</option>
            <option value="audio_link">Audio link</option>
          </select>
          <input
            name="author_name"
            required
            placeholder="Author name"
            className="h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm placeholder:text-muted"
          />
          <input
            name="author_title"
            required
            placeholder="Author title (e.g. Senior Video Editor, 8 yrs)"
            className="h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm placeholder:text-muted"
          />
        </div>
        <textarea
          name="body"
          required
          rows={5}
          placeholder="The insight (or the external link for video/audio)…"
          className="w-full rounded-xl border border-border bg-surface-raised p-3 text-sm placeholder:text-muted"
        />
        <div className="flex items-center gap-5 text-sm text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_premium" /> Premium
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publish" defaultChecked /> Publish now
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save insight"}
        </button>
        {message && <p className="text-sm text-muted">{message}</p>}
      </form>

      <div>
        <h2 className="font-display text-lg font-semibold">Existing</h2>
        <ul className="mt-3 space-y-2">
          {insights.length === 0 && (
            <li className="text-sm text-muted">No insights yet.</li>
          )}
          {insights.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-semibold">{i.author_name}</span>{" "}
                  <span className="text-muted">· {i.skillTitle}</span>
                  {i.is_premium && <span className="text-accent"> · premium</span>}
                </p>
                <p className="truncate text-xs text-muted">{i.author_title}</p>
              </div>
              <button
                onClick={() => togglePublish(i.id, i.published)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                  i.published
                    ? "border-accent/40 text-accent"
                    : "border-border text-muted hover:border-accent"
                }`}
              >
                {i.published ? "Published — unpublish" : "Draft — publish"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
