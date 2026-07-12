import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateSearchQueries,
  mapLessonsToTopics,
  rerankCandidates,
  suggestArticles,
  suggestCreators,
  suggestToolkit,
  verifyUrl,
  type TopicAssignment,
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

/** Deterministic slug for the no-AI topic fallback (same title → same pool). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
const MIN_VIEWS = 5_000;
const MIN_VIEWS_TRUSTED = 500; // respected niche educators aren't view farms
const MIN_DURATION_S = 150; // filter shorts/teasers
const MAX_DURATION_S = 3 * 3600;

// The "professional in the loop": creators an admin approved (or the AI
// suggested, pending review) for a skill. Their content is searched FIRST
// and boosted in ranking; 'rejected' creators are filtered out upstream.
export type TrustedCreator = {
  id: string;
  channel_name: string;
  youtube_channel_id: string | null;
  status: string; // 'approved' | 'suggested'
};

/** Approved + AI-suggested creators for a skill, approved first. Seeds the
    registry with AI suggestions on first use so every skill gets expert-led
    curation even before an admin reviews the list. */
export async function getTrustedCreators(
  admin: Admin,
  skillId: string,
  skillTitle: string,
): Promise<TrustedCreator[]> {
  const { data } = await admin
    .from("skill_creators")
    .select("id, channel_name, youtube_channel_id, status")
    .eq("skill_id", skillId)
    .neq("status", "rejected");
  let creators = data ?? [];

  if (creators.length === 0) {
    try {
      const suggestions = await suggestCreators(skillTitle);
      if (suggestions.length > 0) {
        const { data: inserted } = await admin
          .from("skill_creators")
          .upsert(
            suggestions.map((c) => ({
              skill_id: skillId,
              channel_name: c.channel_name,
              note: c.note,
              status: "suggested",
              source: "ai",
            })),
            { onConflict: "skill_id,channel_name", ignoreDuplicates: true },
          )
          .select("id, channel_name, youtube_channel_id, status");
        creators = inserted ?? [];
      }
    } catch (err) {
      console.error("creator suggestion failed (non-fatal):", err);
    }
  }

  return creators.sort(
    (a, b) =>
      (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1),
  );
}

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

  // Mentor-picked over merely popular: relevance (stage + lesson fit as
  // judged by the model) dominates; views alone can't carry a video in.
  return Math.round(
    100 * (0.45 * relevance + 0.2 * recency + 0.15 * views + 0.1 * authority + 0.1 * likeRatio),
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
  stage: string,
  lessonTitle: string,
  lessonSummary: string | undefined,
  queries: string[],
  creators: TrustedCreator[] = [],
): Promise<void> {
  const { count } = await admin
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId)
    .eq("kind", "youtube")
    .eq("status", "active");
  if ((count ?? 0) >= VIDEOS_PER_LESSON) return; // pool hit

  // 1. Search (the expensive step — 100 units per query).
  // TRUSTED FIRST: the creators professionals actually respect are searched
  // before the open web, so a lesson leads with a mentor-grade pick whenever
  // one exists. Open search only fills the gaps.
  const seen = new Set<string>();
  const candidates: { videoId: string }[] = [];
  const trustedVideoIds = new Set<string>();
  const trustedByChannelId = new Map<string, TrustedCreator>();

  const baseQuery = queries[0] ?? lessonTitle;
  for (const creator of creators.slice(0, 3)) {
    if (candidates.length >= 10) break;
    try {
      const results = creator.youtube_channel_id
        ? await searchVideos(baseQuery, 5, creator.youtube_channel_id)
        : await searchVideos(`${creator.channel_name} ${baseQuery}`, 5);
      for (const r of results) {
        // Name-based searches return lookalikes too — only mark a result
        // trusted when the channel really is this creator's.
        const nameMatch =
          r.channelTitle.toLowerCase().includes(creator.channel_name.toLowerCase()) ||
          creator.channel_name.toLowerCase().includes(r.channelTitle.toLowerCase());
        const isTheirs = creator.youtube_channel_id
          ? r.channelId === creator.youtube_channel_id
          : nameMatch;
        if (!seen.has(r.videoId)) {
          seen.add(r.videoId);
          candidates.push({ videoId: r.videoId });
        }
        if (isTheirs) {
          trustedVideoIds.add(r.videoId);
          trustedByChannelId.set(r.channelId, creator);
          // Resolve the real channel id once so future searches are exact.
          if (!creator.youtube_channel_id) {
            creator.youtube_channel_id = r.channelId;
            void admin
              .from("skill_creators")
              .update({ youtube_channel_id: r.channelId })
              .eq("id", creator.id)
              .is("youtube_channel_id", null)
              .then(({ error }) => {
                if (error) console.error("channel id resolve failed:", error);
              });
          }
        }
      }
    } catch (err) {
      console.error(`trusted search failed for "${creator.channel_name}":`, err);
    }
  }

  // Open search fills whatever the trusted pool didn't cover.
  if (candidates.length < VIDEOS_PER_LESSON * 2) {
    for (const query of queries) {
      try {
        for (const r of await searchVideos(query)) {
          if (!seen.has(r.videoId)) {
            seen.add(r.videoId);
            candidates.push({ videoId: r.videoId });
          }
          // Open search can still surface a trusted creator's video.
          if (trustedByChannelId.has(r.channelId)) trustedVideoIds.add(r.videoId);
        }
      } catch (err) {
        console.error(`search failed for "${query}":`, err);
      }
      if (candidates.length >= 8) break;
    }
  }
  if (candidates.length === 0) return;

  // 2. Live verification — real stats, real status (1 unit per 50 ids).
  const details = (await getVideoDetails(candidates.map((c) => c.videoId))).filter(
    (v) =>
      v.embeddable &&
      v.viewCount >=
        (trustedVideoIds.has(v.videoId) || trustedByChannelId.has(v.channelId)
          ? MIN_VIEWS_TRUSTED
          : MIN_VIEWS) &&
      v.durationSeconds >= MIN_DURATION_S &&
      v.durationSeconds <= MAX_DURATION_S,
  );
  if (details.length === 0) return;

  // 3. Channel authority + model relevance. The re-rank is a *nice-to-have*:
  // if the free AI tier is busy, fall back to a neutral relevance so the
  // stats-based score (views, recency, authority, likes) decides alone —
  // the videos are still real, live-verified, and quality-filtered.
  const subs = await getChannelSubscribers(details.map((d) => d.channelId));
  let relevance: Map<string, number>;
  try {
    relevance = await rerankCandidates({
      skillTitle,
      stage,
      lessonTitle,
      summary: lessonSummary,
      candidates: details,
    });
  } catch (err) {
    console.error(`re-rank unavailable for "${lessonTitle}" — using stats-only ranking:`, err);
    relevance = new Map(details.map((d) => [d.videoId, 6]));
  }

  // 4. Score, keep the best, store in the shared pool.
  const ranked = details
    .map((v) => {
      const creator = trustedByChannelId.get(v.channelId);
      const trustBonus = creator ? (creator.status === "approved" ? 20 : 10) : 0;
      return {
        video: v,
        score: Math.min(
          100,
          scoreVideo(v, subs.get(v.channelId) ?? 0, relevance.get(v.videoId) ?? 0) +
            trustBonus,
        ),
        relevance: relevance.get(v.videoId) ?? 0,
      };
    })
    .filter((s) => s.relevance >= 6) // mentor bar: only videos worth assigning
    .sort((a, b) => b.score - a.score);

  // Diversify: at most 2 videos per channel, so a lesson never becomes one
  // creator's playlist and the learner sees more than one teaching style.
  const perChannel = new Map<string, number>();
  const scored: typeof ranked = [];
  for (const s of ranked) {
    const n = perChannel.get(s.video.channelId) ?? 0;
    if (n >= 2) continue;
    perChannel.set(s.video.channelId, n + 1);
    scored.push(s);
    if (scored.length >= VIDEOS_PER_LESSON + 2) break; // spares for replacements
  }

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
       levels!inner ( name, roadmaps!inner ( enrollments!inner ( skill_id, skills ( id, title ) ) ) )`,
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
    // The level name IS the learner's stage (Beginner/Intermediate/...) —
    // it steers both search queries and the mentor re-rank.
    const stage: string = (mod as any).levels?.name ?? "Beginner";
    // Professionals the industry actually respects — searched first, boosted.
    const creators = await getTrustedCreators(admin, skillId, skillTitle);
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

    // Mappings persist on the lesson rows, so a retry after a partial failure
    // reuses them instead of re-spending AI quota on work already done.
    const lessonTopic = new Map<string, { topicId: string; summary: string }>();
    for (const l of lessons) {
      if (l.topic_id) lessonTopic.set(l.id, { topicId: l.topic_id, summary: l.summary ?? "" });
    }
    const unmapped = lessons.filter((l) => !l.topic_id);

    let assignments: TopicAssignment[] = [];
    if (unmapped.length > 0) {
      try {
        assignments = await mapLessonsToTopics({
          skillTitle,
          moduleTitle: mod.title,
          objectives: (mod.objectives as string[]) ?? [],
          lessons: unmapped.map((l) => ({ index: l.index, title: l.title })),
          existingTopics: (existingTopics ?? []).map((t) => ({ slug: t.slug, title: t.title })),
        });
      } catch (err) {
        // AI busy → derive topics from the lesson titles themselves. Slugs are
        // deterministic, so learners with the same lesson titles still share a
        // resource pool; the summary stays empty rather than made up.
        console.error("topic mapping unavailable — deriving topics from lesson titles:", err);
        assignments = unmapped.map((l) => ({
          lesson_index: l.index,
          topic_slug: slugify(l.title),
          topic_title: l.title,
          summary: "",
        }));
      }
    }

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
        .update({ topic_id: topic.id, summary: a.summary || null })
        .eq("id", lesson.id);
    }

    // --- 2. Fill video pools for unique topics, ONE AT A TIME ---------------
    // Multiple lessons can share a topic; fill each unique topic once. These
    // run *serially*, not in parallel: each fill makes an LLM re-rank call, and
    // the free Gemini tier limits requests-per-minute and bursts. Firing all
    // topics at once tripped a rate-limit sweep ("the free AI tier is busy").
    // Serial spreads the calls out; a whole module still finishes in ~25-35s,
    // well inside Vercel's 60s free-tier function limit.
    let queryMap: Map<number, string[]>;
    try {
      queryMap = await generateSearchQueries({
        skillTitle,
        stage,
        lessons: lessons.map((l) => ({ index: l.index, title: l.title })),
      });
    } catch (err) {
      // AI busy → a plain "<skill> <lesson> tutorial" search still finds good
      // videos; the stats filter and scoring do the quality work.
      console.error("query generation unavailable — using lesson-title queries:", err);
      queryMap = new Map(
        lessons.map((l) => [l.index, [`${skillTitle} ${l.title} tutorial`]]),
      );
    }

    const topicFills = new Map<
      string,
      { lessonTitle: string; summary: string | undefined; queries: string[] }
    >();
    for (const lesson of lessons) {
      const assigned = lessonTopic.get(lesson.id);
      if (!assigned || topicFills.has(assigned.topicId)) continue;
      topicFills.set(assigned.topicId, {
        lessonTitle: lesson.title,
        summary: assigned.summary,
        queries: queryMap.get(lesson.index) ?? [lesson.title],
      });
    }

    const fillResults: PromiseSettledResult<void>[] = [];
    for (const [topicId, f] of topicFills) {
      try {
        await fillTopicVideos(
          admin,
          topicId,
          skillTitle,
          stage,
          f.lessonTitle,
          f.summary,
          f.queries,
          creators,
        );
        fillResults.push({ status: "fulfilled", value: undefined });
      } catch (reason) {
        console.error("topic fill failed:", reason);
        fillResults.push({ status: "rejected", reason });
      }
    }
    // If EVERY topic failed (e.g. a full rate-limit sweep), roll back so the
    // learner can retry instead of getting a permanently-empty module. A
    // partial success is kept.
    if (
      topicFills.size > 0 &&
      fillResults.every((r) => r.status === "rejected")
    ) {
      throw (
        (fillResults.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined
        )?.reason ?? new Error("All topic fills failed")
      );
    }

    // --- 3. Written resources (optional) ------------------------------------
    // Off by default: suggesting + live-verifying article URLs is slow
    // (sequential HTTP checks) and videos are the core value. Enable with
    // CURATE_ARTICLES=true on a platform without a tight function timeout.
    if (process.env.CURATE_ARTICLES === "true") {
      try {
        const suggestions = await suggestArticles({
          skillTitle,
          lessons: lessons.map((l) => ({ index: l.index, title: l.title })),
        });
        await Promise.all(
          suggestions
            .slice(0, lessons.length * ARTICLES_PER_LESSON)
            .map(async (s) => {
              const lesson = lessons.find((l) => l.index === s.lesson_index);
              const assigned = lesson && lessonTopic.get(lesson.id);
              if (!assigned) return;
              if (!(await verifyUrl(s.url))) return; // never store an unverified link
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
            }),
        );
      } catch (err) {
        console.error("article suggestions failed (non-fatal):", err);
      }
    }

    // --- 4. Link each lesson to the best of its topic's pool ----------------
    await Promise.all(
      lessons.map((lesson) => {
        const assigned = lessonTopic.get(lesson.id);
        return assigned
          ? linkLessonResources(admin, lesson.id, assigned.topicId)
          : Promise.resolve();
      }),
    );

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

// ---------------------------------------------------------------------------
// Admin re-curation: retire a module's current video pools and rebuild them
// with the current pipeline (trusted creators, mentor re-rank). Topic
// mappings are kept — only the resource pools and lesson links refresh.
// ---------------------------------------------------------------------------
export async function recurateModule(admin: Admin, moduleId: string): Promise<void> {
  const { data: lessons } = await admin
    .from("lessons")
    .select("id, topic_id")
    .eq("module_id", moduleId);

  const topicIds = [
    ...new Set((lessons ?? []).map((l) => l.topic_id).filter(Boolean)),
  ] as string[];
  if (topicIds.length > 0) {
    await admin
      .from("resources")
      .update({ status: "replaced" })
      .in("topic_id", topicIds)
      .eq("kind", "youtube")
      .eq("status", "active");
  }

  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length > 0) {
    await admin.from("lesson_resources").delete().in("lesson_id", lessonIds);
  }

  await admin.from("modules").update({ hydration_status: "skeleton" }).eq("id", moduleId);
  await hydrateModule(admin, moduleId);
}

// ---------------------------------------------------------------------------
// "Professional toolkit": the optional adjacent competencies working
// professionals in this field lean on (time management, client comms,
// pricing…). Stored as shared topics (slug prefix 'toolkit-') so every
// learner of the skill gets the same curated set. Idempotent + cached.
// ---------------------------------------------------------------------------
export type ToolkitItem = {
  slug: string;
  title: string;
  why: string | null;
  resources: { id: string; title: string; url: string; channel: string | null }[];
};

export async function getOrHydrateToolkit(
  admin: Admin,
  skillId: string,
): Promise<ToolkitItem[]> {
  const loadExisting = async (): Promise<ToolkitItem[]> => {
    const { data: topics } = await admin
      .from("topics")
      .select("id, slug, title, description")
      .eq("skill_id", skillId)
      .like("slug", "toolkit-%")
      .order("created_at", { ascending: true });
    if (!topics || topics.length === 0) return [];
    const items: ToolkitItem[] = [];
    for (const t of topics) {
      const { data: resources } = await admin
        .from("resources")
        .select("id, title, url, channel")
        .eq("topic_id", t.id)
        .eq("status", "active")
        .order("quality_score", { ascending: false })
        .limit(2);
      items.push({
        slug: t.slug,
        title: t.title,
        why: t.description,
        resources: resources ?? [],
      });
    }
    return items;
  };

  const existing = await loadExisting();
  if (existing.length > 0) return existing;

  const { data: skill } = await admin
    .from("skills")
    .select("title")
    .eq("id", skillId)
    .single();
  if (!skill) return [];

  const competencies = await suggestToolkit(skill.title);
  const creators = await getTrustedCreators(admin, skillId, skill.title);

  for (const c of competencies) {
    const { data: topic, error } = await admin
      .from("topics")
      .upsert(
        {
          skill_id: skillId,
          slug: `toolkit-${slugify(c.slug)}`,
          title: c.title,
          description: c.why,
        },
        { onConflict: "skill_id,slug" },
      )
      .select("id")
      .single();
    if (error || !topic) {
      console.error("toolkit topic create failed:", error);
      continue;
    }
    try {
      await fillTopicVideos(
        admin,
        topic.id,
        skill.title,
        "Working professional (career toolkit)",
        c.title,
        c.why,
        [c.search_query],
        creators,
      );
    } catch (err) {
      console.error(`toolkit fill failed for "${c.title}":`, err);
    }
  }

  return loadExisting();
}
