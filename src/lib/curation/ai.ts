import "server-only";

import { generateStructured } from "@/lib/llm";

// All curation AI calls run on the fast tier — short, high-volume, cheap.
// CRITICAL INVARIANT: the model NEVER produces YouTube URLs or video IDs.
// It produces search queries and re-ranks real candidates returned by the
// YouTube API — hallucinated links are impossible by construction.

async function fastJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const text = await generateStructured({
    tier: "fast",
    system,
    user,
    schema,
    maxTokens: 2048,
  });
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// 1. Topic mapping: assign each lesson in a module to the skill's canonical
//    topic taxonomy (reusing existing topics first) + write a short summary.
//    Shared topics are what make curation collective across learners.
// ---------------------------------------------------------------------------
export type TopicAssignment = {
  lesson_index: number;
  topic_slug: string;
  topic_title: string;
  summary: string;
};

export async function mapLessonsToTopics(input: {
  skillTitle: string;
  moduleTitle: string;
  objectives: string[];
  lessons: { index: number; title: string }[];
  existingTopics: { slug: string; title: string }[];
}): Promise<TopicAssignment[]> {
  const schema = {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lesson_index: { type: "integer" },
            topic_slug: { type: "string" },
            topic_title: { type: "string" },
            summary: { type: "string" },
          },
          required: ["lesson_index", "topic_slug", "topic_title", "summary"],
          additionalProperties: false,
        },
      },
    },
    required: ["assignments"],
    additionalProperties: false,
  };

  const { assignments } = await fastJson<{ assignments: TopicAssignment[] }>(
    `You maintain the topic taxonomy for a skill-learning platform. Topics are canonical units of curriculum shared across all learners — learning resources attach to topics.

For each lesson, assign a topic:
- STRONGLY prefer reusing an existing topic when the lesson covers the same material (even with different wording).
- Only mint a new topic for genuinely new material. New slugs: lowercase, hyphenated, stable, tool-agnostic where sensible (e.g. "color-grading-basics").
- Write "summary" as 1-2 plain sentences telling the learner what they'll be able to do after this lesson.
Output JSON only.`,
    JSON.stringify({
      skill: input.skillTitle,
      module: input.moduleTitle,
      module_objectives: input.objectives,
      lessons: input.lessons,
      existing_topics: input.existingTopics,
    }),
    schema,
  );
  return assignments;
}

// ---------------------------------------------------------------------------
// 2. Search query generation, batched per module.
// ---------------------------------------------------------------------------
export async function generateSearchQueries(input: {
  skillTitle: string;
  stage: string;
  lessons: { index: number; title: string }[];
}): Promise<Map<number, string[]>> {
  const schema = {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lesson_index: { type: "integer" },
            search_queries: { type: "array", items: { type: "string" } },
          },
          required: ["lesson_index", "search_queries"],
          additionalProperties: false,
        },
      },
    },
    required: ["queries"],
    additionalProperties: false,
  };

  const { queries } = await fastJson<{
    queries: { lesson_index: number; search_queries: string[] }[];
  }>(
    `You are a working professional curating YouTube for your students. Each lesson belongs to a specific STAGE of the learner's journey — the queries must find videos pitched at that stage, not generic ones.

For each lesson produce exactly 2 queries:
- Query 1: the phrasing the best dedicated tutorial at this stage would use in its title. For early stages append phrases like "for beginners" or "step by step"; for later stages use "advanced", "workflow", "masterclass", or the professional term of art.
- Query 2: a distinct angle — the key tool's name, a project-based phrasing ("build/edit/design X"), or an alternative term professionals use.
Keep queries short (3-8 words). English. No quotes or operators. Output JSON only.`,
    JSON.stringify({
      skill: input.skillTitle,
      learner_stage: input.stage,
      lessons: input.lessons,
    }),
    schema,
  );

  const map = new Map<number, string[]>();
  for (const q of queries) map.set(q.lesson_index, q.search_queries.slice(0, 2));
  return map;
}

// ---------------------------------------------------------------------------
// 3. Relevance re-ranking of REAL candidates from the YouTube API.
// ---------------------------------------------------------------------------
export type CandidateForRank = {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  viewCount: number;
  publishedAt: string;
};

export async function rerankCandidates(input: {
  skillTitle: string;
  stage: string;
  lessonTitle: string;
  summary?: string;
  candidates: CandidateForRank[];
}): Promise<Map<string, number>> {
  const schema = {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            video_id: { type: "string" },
            relevance: { type: "integer" }, // 0-10
          },
          required: ["video_id", "relevance"],
          additionalProperties: false,
        },
      },
    },
    required: ["scores"],
    additionalProperties: false,
  };

  const { scores } = await fastJson<{
    scores: { video_id: string; relevance: number }[];
  }>(
    `You are a senior professional in this skill, hand-picking the ONE OR TWO videos you would give your own student for this exact lesson at this exact stage of their journey. The learner is escaping "tutorial hell" — random videos that entertain but don't move them forward. Judge each candidate from its real title/description metadata. Score 0-10:
- 9-10: exactly what a mentor would assign — squarely teaches this lesson, pitched at this stage, structured teaching (clear topic, steps or a real project), from someone who plainly knows the craft.
- 6-8: solid teaching of this lesson but imperfect fit — slightly off-stage (too basic/advanced), covers it inside broader content, or weaker structure.
- 3-5: related but would NOT move this learner forward right now — wrong stage, tangential topic, talky vlog with thin instruction.
- 0-2: off-topic, clickbait ("I made $10k…", "STOP doing this"), product promo, gear/software reviews, drama, or not a tutorial at all.
Be strict: a video can be popular and still score 3. Stage fit matters as much as topic fit. Score every candidate. Output JSON only.`,
    JSON.stringify({
      skill: input.skillTitle,
      learner_stage: input.stage,
      lesson: input.lessonTitle,
      lesson_summary: input.summary ?? "",
      candidates: input.candidates.map((c) => ({
        video_id: c.videoId,
        title: c.title,
        channel: c.channelTitle,
        description: c.description.slice(0, 300),
        views: c.viewCount,
        published: c.publishedAt.slice(0, 10),
      })),
    }),
    schema,
  );

  const map = new Map<string, number>();
  for (const s of scores) map.set(s.video_id, Math.max(0, Math.min(10, s.relevance)));
  return map;
}

// ---------------------------------------------------------------------------
// 4. Written-resource suggestions. URLs from a model CAN be hallucinated, so
//    every suggestion is verified with a live HTTP check before storage —
//    same "never show an unverified link" rule as videos.
// ---------------------------------------------------------------------------
export type ArticleSuggestion = {
  lesson_index: number;
  title: string;
  url: string;
  kind: "article" | "docs";
};

export async function suggestArticles(input: {
  skillTitle: string;
  lessons: { index: number; title: string }[];
}): Promise<ArticleSuggestion[]> {
  const schema = {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lesson_index: { type: "integer" },
            title: { type: "string" },
            url: { type: "string" },
            kind: { type: "string", enum: ["article", "docs"] },
          },
          required: ["lesson_index", "title", "url", "kind"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  };

  const { suggestions } = await fastJson<{ suggestions: ArticleSuggestion[] }>(
    `Suggest free written resources (official docs, major learning sites) for skill lessons. Up to 2 per lesson, 0 is fine.

STRICT RULES — every URL will be live-verified and dead links hurt users:
- Only suggest URLs you are highly confident exist: official documentation landing pages, MDN, freeCodeCamp, Google/Meta official help centers, W3Schools, and similar major sites.
- Prefer stable top-level or section URLs over deep links you might be misremembering.
- If you know no reliable written resource for a lesson, return nothing for it.
Output JSON only.`,
    JSON.stringify({ skill: input.skillTitle, lessons: input.lessons }),
    schema,
  );
  return suggestions;
}

// ---------------------------------------------------------------------------
// 5. Respected-educator suggestions per skill. Names only — every name is
//    then used as a SEARCH SEED against the real YouTube API, so a wrong
//    name simply finds nothing; nothing is fabricated into the product.
// ---------------------------------------------------------------------------
export type CreatorSuggestion = { channel_name: string; note: string };

export async function suggestCreators(
  skillTitle: string,
): Promise<CreatorSuggestion[]> {
  const schema = {
    type: "object",
    properties: {
      creators: {
        type: "array",
        items: {
          type: "object",
          properties: {
            channel_name: { type: "string" },
            note: { type: "string" },
          },
          required: ["channel_name", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["creators"],
    additionalProperties: false,
  };

  const { creators } = await fastJson<{ creators: CreatorSuggestion[] }>(
    `You know the professional landscape of online skill education. List the YouTube educators that WORKING PROFESSIONALS in this field genuinely respect and recommend to newcomers — the names that come up when practitioners are asked "who should I learn from?".

Rules:
- 5-8 names. Only creators you are confident actually teach this skill on YouTube.
- Prioritize practitioners who teach from real client/job experience over content-mill channels.
- Include respected African/Nigerian educators in this field when they exist — this platform serves Nigerian learners first.
- "note" = one short sentence on why professionals rate them.
Output JSON only.`,
    JSON.stringify({ skill: skillTitle }),
    schema,
  );
  return creators.slice(0, 8);
}

// ---------------------------------------------------------------------------
// 6. "Professional toolkit": the adjacent competencies every working
//    professional in this field needs (e.g. time management for social media
//    managers). Rendered as an optional section on the roadmap.
// ---------------------------------------------------------------------------
export type ToolkitCompetency = {
  slug: string;
  title: string;
  why: string;
  search_query: string;
};

export async function suggestToolkit(
  skillTitle: string,
): Promise<ToolkitCompetency[]> {
  const schema = {
    type: "object",
    properties: {
      competencies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            why: { type: "string" },
            search_query: { type: "string" },
          },
          required: ["slug", "title", "why", "search_query"],
          additionalProperties: false,
        },
      },
    },
    required: ["competencies"],
    additionalProperties: false,
  };

  const { competencies } = await fastJson<{ competencies: ToolkitCompetency[] }>(
    `You are a senior professional in this field mentoring someone who wants to EARN with this skill, not just learn it. List the 4 adjacent competencies that most often separate working professionals from hobbyists — things like client communication, pricing/negotiation, time management and organization, portfolio building, or personal branding, chosen for THIS specific field.

- "slug": lowercase-hyphenated, stable (e.g. "client-communication").
- "title": short human label.
- "why": one sentence on why this matters for earning in this field (Nigerian freelance/job market context welcome).
- "search_query": the YouTube search (3-8 words) that finds a genuinely good practical video on it for this profession.
Output JSON only.`,
    JSON.stringify({ skill: skillTitle }),
    schema,
  );
  return competencies.slice(0, 4);
}

/** Live-verify a suggested URL. Returns true only for a reachable page. */
export async function verifyUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BestpathBot/1.0)" },
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}
