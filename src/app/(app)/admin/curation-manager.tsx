"use client";

import { useCallback, useEffect, useState } from "react";

type Creator = {
  id: string;
  channel_name: string;
  youtube_channel_id: string | null;
  note: string | null;
  status: "suggested" | "approved" | "rejected";
  source: "ai" | "admin";
};

type ModuleRow = { id: string; title: string; skillTitle: string };

/** Admin curation console: the trusted-creator registry per skill, plus
    one-click re-curation of already-hydrated modules. */
export function CurationManager({
  skills,
  modules,
}: {
  skills: { id: string; title: string }[];
  modules: ModuleRow[];
}) {
  const [skillId, setSkillId] = useState(skills[0]?.id ?? "");
  const [creators, setCreators] = useState<Creator[]>([]);
  // Loading is derived: we're loading whenever the list on screen belongs to
  // a different skill than the one selected.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = skillId !== loadedFor;
  const [busy, setBusy] = useState<string | null>(null); // id of in-flight row / action
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const loadCreators = useCallback(async (sid: string) => {
    if (!sid) return;
    try {
      const res = await fetch(`/api/admin/creators?skillId=${sid}`);
      const data = await res.json();
      setCreators(res.ok ? (data.creators ?? []) : []);
    } catch {
      setCreators([]);
    } finally {
      setLoadedFor(sid);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadCreators(skillId);
    })();
    return () => {
      cancelled = true;
    };
  }, [skillId, loadCreators]);

  async function addCreator(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("add");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, channelName: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        await loadCreators(skillId);
      } else {
        setMessage((await res.json()).error ?? "Add failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: Creator["status"]) {
    setBusy(id);
    try {
      await fetch(`/api/admin/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadCreators(skillId);
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("suggest");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/creators/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`AI suggested ${data.suggested} creators — review them below.`);
        await loadCreators(skillId);
      } else {
        setMessage(data.error ?? "Suggestion failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function recurate(moduleId: string) {
    setBusy(moduleId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/modules/${moduleId}/recurate`, {
        method: "POST",
      });
      setMessage(
        res.ok
          ? "Module re-curated with the current trusted-creator pipeline. ✓"
          : ((await res.json()).error ?? "Re-curation failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  const grouped: [string, Creator[]][] = [
    ["Approved — searched first, biggest boost", creators.filter((c) => c.status === "approved")],
    ["AI-suggested — guides search until you review", creators.filter((c) => c.status === "suggested")],
    ["Rejected — never surfaced", creators.filter((c) => c.status === "rejected")],
  ];

  return (
    <div className="mt-10 space-y-10">
      {/* ---- Trusted creators ---- */}
      <section>
        <h2 className="font-display text-xl font-bold">Trusted creators</h2>
        <p className="mt-1 text-sm text-muted">
          The professionals whose videos lead every lesson for this skill.
          Approve the names you rate; reject anyone who shouldn&apos;t appear.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            onClick={suggest}
            disabled={busy !== null}
            className="h-10 rounded-xl border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {busy === "suggest" ? "Asking AI…" : "✨ Suggest with AI"}
          </button>
        </div>

        <form onSubmit={addCreator} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a creator you trust, e.g. Latasha James"
            className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy !== null || !newName.trim()}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy === "add" ? "Adding…" : "Add as approved"}
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-accent">{message}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading creators…</p>
        ) : creators.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No creators yet for this skill — add the names you trust or let the
            AI suggest a starting list.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {grouped.map(
              ([label, list]) =>
                list.length > 0 && (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {label}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {list.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {c.channel_name}
                              {c.source === "ai" && (
                                <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted">
                                  AI
                                </span>
                              )}
                            </p>
                            {c.note && (
                              <p className="mt-0.5 text-xs text-muted">{c.note}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            {c.status !== "approved" && (
                              <button
                                onClick={() => setStatus(c.id, "approved")}
                                disabled={busy !== null}
                                className="rounded-lg border border-accent/40 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}
                            {c.status !== "rejected" && (
                              <button
                                onClick={() => setStatus(c.id, "rejected")}
                                disabled={busy !== null}
                                className="rounded-lg border border-red-400/40 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        )}
      </section>

      {/* ---- Re-curate modules ---- */}
      <section>
        <h2 className="font-display text-xl font-bold">Re-curate modules</h2>
        <p className="mt-1 text-sm text-muted">
          Rebuild a module&apos;s videos with the current pipeline — trusted
          creators first, mentor-grade re-ranking. Use after updating the
          creator list. Takes ~30-60s per module.
        </p>
        {modules.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No hydrated modules yet — open a module in a roadmap first.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {modules.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted">{m.skillTitle}</p>
                </div>
                <button
                  onClick={() => recurate(m.id)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
                >
                  {busy === m.id ? "Re-curating…" : "↻ Re-curate"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
