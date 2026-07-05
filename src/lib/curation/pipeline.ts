import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateSearchQueries,
  mapLessonsToTopics,
  rerankCandidates,
  suggestArticles,
  verifyUrl,
} from "./ai";
import {
  getChannelSubscribers,
  getVideoDetails,
  searchVideos,
  type VideoDetails,
} from "@/lib/youtube";

type Admin = SupabaseClient;

const VIDEOS_PER_LESSON = 3;
const ARTICLES_PER_LESSON = 2;
const MIN_VIEWS = 5_000;
const MIN_DURATION_S = 150; // filter shorts/teasers
const MAX_DURATION_S = 3 * 3600;

// ---------------------------------------------------------------------------
// Quality score: recency + engagement + channel authority + model relevance.
// 0-100. Stored on the resource; feedback counters adjust ranking later.
// ---------------------------------------------------------------------------
export function scoreVideo(
  v: VideoDetails,
  channelSubs: number,
  relevance0to10: number,
): number {
  const ageYears =
    (Date.now() - new Date(v.publishedAt).getTime()) / (365.25 * 24 * 3600 * 1000);
  const recency = Math.exp(-Math.max(0, ageYears) / 2.5); // ~0.45 at 2y, ~0.2 at 4y
  const views = Math.min(1, Math.log10(v.viewCount + 1) / 7); // 10M views -> 1.0
  const likeRatio = v.viewCount > 0 ? Math.min(1, (v.likeCount / v.viewCount) / 0.05) : 0;
  const authority = Math.min(1, Math.log10(channelSubs + 1) / 7);
  const relevance = relevance0to10 / 10;

  return Math.round(
    100 * (0.35 * relevance + 0.2 * recency + 0.2 * views + 0.15 * authority + 0.1 * likeRatio),
  );
}

// ---------------------------------------------------------------------------
// Fill a topic's video pool via search → live verify → re-rank → store.
// No-op when the pool already has enough active videos (the common case —
// this is what makes steady-state quota usage near zero).
// ---------------------------------------------------------------------------
async function fillTopicVideos(
  admin: Admin,
  topicId: string,
  skillTitle: string,
  lessonTitle: string,
  lessonSummary: string | undefined,
  queries: string[],
): Promise<void> {
  const { count } = await admin
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId)
    .eq("kind", "youtube")
    .eq("status", "active");
  if ((count ?? 0) >= VIDEOS_PER_LESSON) return; // pool hit

  // 1. Search (the expensive step — 100 units per query).
  const seen = new Set<string>();
  const candidates: { videoId: string }[] = [];
  for (const query of queries) {
    try {
      for (const r of await searchVideos(query)) {
        if (!seen.has(r.videoId)) {
          seen.add(r.videoId);
          candidates.push({ videoId: r.videoId });
        }
      }
    } catch (err) {
      console.error(`search failed for "${query}":`, err);
    }
  }
  if (candidates.length === 0) return;

  // 2. Live verification — real stats, real status (1 unit per 50 ids).
  const details = (await getVideoDetails(candidates.map((c) => c.videoId))).filter(
    (v) =>
      v.embeddable &&
      v.viewCount >= MIN_VIEWS &&
      v.durationSeconds >= MIN_DURATION_S &&
      v.durationSeconds <= MAX_DURATION_S,
  );
  if (details.length === 0) return;

  // 3. Channel authority + model relevance.
  const subs = await getChannelSubscribers(details.map((d) => d.channelId));
  const relevance = await rerankCandidates({
    skillTitle,
    lessonTitle,
    summary: lessonSummary,
    candidates: details,
  });

  // 4. Score, keep the best, store in the shared pool.
  const scored = details
    .map((v) => ({
      video: v,
      score: scoreVideo(v, subs.get(v.channelId) ?? 0, relevance.get(v.videoId) ?? 0),
      relevance: relevance.get(v.videoId) ?? 0,
    }))
    .filter((s) => s.relevance >= 5) // never store off-topic videos
    .sort((a, b) => b.score - a.score)
    .slice(0, VIDEOS_PER_LESSON + 2); // a couple of spares for replacements

  if (scored.length === 0) return;

  const { error } = await admin.from("resources").upsert(
    scored.map(({ video, score }) => ({
      topic_id: topicId,
      kind: "youtube" as const,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      youtube_video_id: video.videoId,
      title: video.title,
      channel: video.channelTitle,
      published_at: video.publishedAt,
      stats: {
        views: video.viewCount,
        likes: video.likeCount,
        duration_s: video.durationSeconds,
      },
      quality_score: score,
      status: "active" as const,
      last_verified_at: new Date().toISOString(),
    })),
    { onConflict: "topic_id,url", ignoreDuplicates: true },
  );
  if (error) console.error("resource insert failed:", error);
}

// ---------------------------------------------------------------------------
// Hydrate one module: topics → summaries → resource pools → lesson links.
// Idempotent; safe to re-run after partial failure.
// ---------------------------------------------------------------------------
export async function hydrateModule(admin: Admin, moduleId: string): Promise<void> {
  // Load the module with its lessons and the parent skill.
  const { data: mod, error: modError } = await admin
    .from("modules")
    .select(
      `id, title, objectives, hydration_status,
       lessons ( id, index, title, topic_id, summary ),
       levels!inner ( roadmaps!inner ( enrollments!inner ( skill_id, skills ( id, title ) ) ) )`,
    )
    .eq("id", moduleId)
    .single();
  if (modError || !mod) throw modError ?? new Error("module not found");
  if (mod.hydration_status === "hydrated") return;

  await admin.from("modules").update({ hydration_status: "hydrating" }).eq("id", moduleId);

  try {
    // Untangle the nested join (PostgREST returns objects for !inner one-to-one).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const enrollment = (mod as any).levels?.roadmaps?.enrollments;
    const skillId: string = enrollment?.skill_id;
    const skillTitle: string = enrollment?.skills?.title ?? "the skill";
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!skillId) throw new Error("could not resolve skill for module");

    const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.index - b.index);
    if (lessons.length === 0) {
      await admin.from("modules").update({ hydration_status: "hydrated" }).eq("id", moduleId);
      return;
    }

    // --- 1. Topic mapping (reuse the skill's shared taxonomy) --------------
    const { data: existingTopics } = await admin
      .from("topics")
      .select("id, slug, title")
      .eq("skill_id", skillId)
      .limit(200);
    const topicBySlug = new Map((existingTopics ?? []).map((t) => [t.slug, t]));

    const assignments = await mapLessonsToTopics({
      skillTitle,
      moduleTitle: mod.title,
      objectives: (mod.objectives as string[]) ?? [],
      lessons: lessons.map((l) => ({ index: l.index, title: l.title })),
      existingTopics: (existingTopics ?? []).map((t) => ({ slug: t.slug, title: t.title })),
    });

    const lessonTopic = new Map<string, { topicId: string; summary: string }>();
    for (const a of assignments) {
      const lesson = lessons.find((l) => l.index === a.lesson_index);
      if (!lesson) continue;

      let topic = topicBySlug.get(a.topic_slug);
      if (!topic) {
        const { data: created, error } = await admin
          .from("topics")
          .upsert(
            { skill_id: skillId, slug: a.topic_slug, title: a.topic_title },
            { onConflict: "skill_id,slug" },
          )
          .select("id, slug, title")
          .single();
        if (error || !created) {
          console.error("topic create failed:", error);
          continue;
        }
        topic = created;
        topicBySlug.set(created.slug, created);
      }

      lessonTopic.set(lesson.id, { topicId: topic.id, summary: a.summary });
      await admin
        .from("lessons")
        .update({ topic_id: topic.id, summary: a.summary })
        .eq("id", lesson.id);
    }

    // --- 2. Fill video pools for topics that need it ------------------------
    const queryMap = await generateSearchQueries({
      skillTitle,
      lessons: lessons.map((l) => ({ index: l.index, title: l.title })),
    });

    for (const lesson of lessons) {
      const assigned = lessonTopic.get(lesson.id);
      if (!assigned) continue;
      await fillTopicVideos(
        admin,
        assigned.topicId,
        skillTitle,
        lesson.title,
        assigned.summary,
        queryMap.get(lesson.index) ?? [lesson.title],
      );
    }

    // --- 3. Written resources: suggest → live-verify → store ----------------
    try {
      const suggestions = await suggestArticles({
        skillTitle,
        lessons: lessons.map((l) => ({ index: l.index, title: l.title })),
      });
      for (const s of suggestions.slice(0, lessons.length * ARTICLES_PER_LESSON)) {
        const lesson = lessons.find((l) => l.index === s.lesson_index);
        const assigned = lesson && lessonTopic.get(lesson.id);
        if (!assigned) continue;
        if (!(await verifyUrl(s.url))) continue; // never store an unverified link

        await admin.from("resources").upsert(
          {
            topic_id: assigned.topicId,
            kind: s.kind,
            url: s.url,
            title: s.title,
            quality_score: 50,
            status: "active",
            last_verified_at: new Date().toISOString(),
          },
          { onConflict: "topic_id,url", ignoreDuplicates: true },
        );
      }
    } catch (err) {
      console.error("article suggestions failed (non-fatal):", err);
    }

    // --- 4. Link each lesson to the best of its topic's pool ----------------
    for (const lesson of lessons) {
      const assigned = lessonTopic.get(lesson.id);
      if (!assigned) continue;
      await linkLessonResources(admin, lesson.id, assigned.topicId);
    }

    await admin.from("modules").update({ hydration_status: "hydrated" }).eq("id", moduleId);
  } catch (err) {
    // Roll back to skeleton so a retry re-runs hydration from the top.
    await admin.from("modules").update({ hydration_status: "skeleton" }).eq("id", moduleId);
    throw err;
  }
}

/** Link the lesson to the top videos + articles from its topic pool. */
export async function linkLessonResources(
  admin: Admin,
  lessonId: string,
  topicId: string,
  excludeResourceIds: string[] = [],
): Promise<void> {
  const { data: pool } = await admin
    .from("resources")
    .select("id, kind, quality_score, upvotes, downvotes")
    .eq("topic_id", topicId)
    .eq("status", "active")
    .order("quality_score", { ascending: false });

  const usable = (pool ?? []).filter((r) => !excludeResourceIds.includes(r.id));
  // Feedback-adjusted ranking: each net vote nudges the score.
  const ranked = usable.sort(
    (a, b) =>
      b.quality_score + 2 * (b.upvotes - b.downvotes) -
      (a.quality_score + 2 * (a.upvotes - a.downvotes)),
  );

  const videos = ranked.filter((r) => r.kind === "youtube").slice(0, VIDEOS_PER_LESSON);
  const articles = ranked.filter((r) => r.kind !== "youtube").slice(0, ARTICLES_PER_LESSON);
  const chosen = [...videos, ...articles];
  if (chosen.length === 0) return;

  await admin.from("lesson_resources").delete().eq("lesson_id", lessonId);
  const { error } = await admin.from("lesson_resources").insert(
    chosen.map((r, i) => ({ lesson_id: lessonId, resource_id: r.id, rank: i + 1 })),
  );
  if (error) console.error("lesson_resources insert failed:", error);
}
