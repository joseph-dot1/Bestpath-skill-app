import "server-only";

import type { LearnerProfile } from "@/lib/assessment/engine";
import { streamStructured } from "@/lib/llm";

// ---------------------------------------------------------------------------
// Skeleton shape produced by the model. Lesson detail (summaries, topics,
// verified resources) hydrates lazily in Milestone 3 — the skeleton is the
// structure the learner sees seconds after finishing the assessment.
// ---------------------------------------------------------------------------
export type SkeletonModule = {
  title: string;
  objectives: string[];
  est_hours: number;
  lessons: string[]; // lesson titles, concrete enough to seed YouTube queries
};

export type SkeletonLevel = {
  name: "Beginner" | "Intermediate" | "Advanced" | "Professional";
  modules: SkeletonModule[];
};

const SYSTEM_PROMPT = `You design learning roadmaps for Bestpath. Given a skill and a learner profile, produce a roadmap as JSON with exactly four levels in order: Beginner, Intermediate, Advanced, Professional.

Structure rules:
- Keep it TIGHT: exactly 2-3 modules per level, and 3-4 lessons per module. A focused path a beginner can actually finish beats an exhaustive one. Do not exceed these counts.
- Module objectives: 2-3 concrete "can do" statements (not "understand X" — "edit a 60-second video with cuts and transitions").
- est_hours per module: realistic total hours including practice, typically 2-12.
- Lesson titles must be concrete and specific — they seed YouTube searches later. "Color grading with Lumetri Color in Premiere Pro" beats "Color basics".
- Sequence for momentum: the learner should make something real inside the first module.

Personalization rules:
- Respect the learner's prior level: if they already know the basics, Beginner becomes a fast, honest refresher (1-2 short modules) rather than padding — never omit a level.
- Bias tool and niche choices toward the learner's stated goal (job / freelance income / hobby / certification) and any specifics they gave.
- Prefer free tools and low-bandwidth-friendly workflows where quality allows (most learners are in Nigeria on mobile data).
- Professional level = working-at-a-paid-standard: portfolio pieces, client/job workflows, pricing/interviewing where relevant to the goal.

HARDWARE RULE (very important — read the learner's device, device_power, and tools context):
- Only teach tools the learner can actually run TODAY. NEVER build a roadmap around software their hardware can't handle — a smooth experience on a modest tool beats a slideshow on the "industry standard". Be FACTUAL about real requirements:
  - DaVinci Resolve, Adobe Premiere Pro, After Effects: need device_power "high" (16GB+ RAM, modern machine, ideally a GPU). On an 8GB or older laptop they stutter, crash on export, and make beginners quit. NEVER centre a path on them for "mid", "low", or "unknown" power.
  - Video editing on "mid" power (8GB, runs fine): centre on CapCut Desktop (free, light) or Filmora; phone/"low": CapCut mobile, VN, InShot.
  - Photoshop/Illustrator: "high" only. Design on "mid"/"low"/phone: Canva, Figma in the browser, Photopea (free browser Photoshop).
  - Blender/3D and heavy audio production (full DAWs with large sample libraries): "high" only; otherwise choose light/browser alternatives (e.g. BandLab, Soundtrap for audio).
  - Coding, data analysis (Google Sheets/Excel, browser-based tools like Google Colab, Canva, Notion, Meta Business Suite): fine on "mid"; on "low"/phone prefer browser-based workflows (Colab, Replit, StackBlitz, Sheets).
- device_power "unknown" = treat as "mid" at best, and prefer the lighter tool at every choice.
- If they already named a tool they have or a constraint ("I only have CapCut", "can't afford Adobe"), honour it — start where they are.
- Whatever tool the path centres on, an early lesson should be installing/opening that specific tool. It is fine to add ONE optional "when you upgrade your device" note at a higher level (e.g. "at 16GB+ RAM, learn DaVinci Resolve"), but the core path must work on what they have today.

Output JSON only, matching the required schema.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    levels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: ["Beginner", "Intermediate", "Advanced", "Professional"],
          },
          modules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                objectives: { type: "array", items: { type: "string" } },
                est_hours: { type: "number" },
                lessons: { type: "array", items: { type: "string" } },
              },
              required: ["title", "objectives", "est_hours", "lessons"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "modules"],
        additionalProperties: false,
      },
    },
  },
  required: ["levels"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Incremental extraction: pull complete level objects out of the streaming
// JSON as their closing brace arrives, so the UI can render level-by-level.
// ---------------------------------------------------------------------------
export class LevelExtractor {
  private buffer = "";
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private levelStart = -1;
  private emitted = 0;

  /** Feed a text delta; returns any newly-completed level objects. */
  push(delta: string): SkeletonLevel[] {
    this.buffer += delta;
    const found: SkeletonLevel[] = [];

    for (; this.pos < this.buffer.length; this.pos++) {
      const ch = this.buffer[this.pos];

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') {
        this.inString = true;
      } else if (ch === "{") {
        this.depth++;
        // Depth 1 is the root object; depth 2 objects are levels.
        if (this.depth === 2 && this.levelStart === -1) {
          this.levelStart = this.pos;
        }
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 1 && this.levelStart !== -1) {
          const slice = this.buffer.slice(this.levelStart, this.pos + 1);
          this.levelStart = -1;
          try {
            found.push(JSON.parse(slice) as SkeletonLevel);
            this.emitted++;
          } catch {
            // Incomplete/odd slice — the final full parse is authoritative.
          }
        }
      }
    }
    return found;
  }

  get emittedCount() {
    return this.emitted;
  }
}

export type SkeletonEvent =
  | { type: "level"; level: SkeletonLevel; index: number }
  | { type: "done"; levels: SkeletonLevel[] };

/**
 * Stream the roadmap skeleton, yielding each level as it completes and a
 * final `done` event with the fully-parsed (authoritative) skeleton.
 */
export async function* streamRoadmapSkeleton(
  skillTitle: string,
  profile: LearnerProfile,
): AsyncGenerator<SkeletonEvent> {
  const userMessage = [
    `Skill: ${skillTitle}`,
    `Prior level: ${profile.prior_level}`,
    `Weekly time budget: ${profile.weekly_hours} hours`,
    `Goal: ${profile.goal} — ${profile.goal_detail}`,
    `Format preference: ${profile.format_pref}`,
    `Device: ${profile.device ?? "unknown"} (power: ${profile.device_power ?? "unknown"})`,
    `Hardware & tools context (drives tool choice): ${profile.tools_context ?? "not provided"}`,
    `Curriculum designer's notes: ${profile.summary}`,
  ].join("\n");

  const stream = streamStructured({
    tier: "reasoning",
    system: SYSTEM_PROMPT,
    user: userMessage,
    schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    // Tighter roadmap (2-3 modules/level) fits comfortably and generates
    // roughly twice as fast as the old 16k budget on the free tier.
    maxTokens: 10000,
  });

  const extractor = new LevelExtractor();
  let index = 0;
  let text = "";

  // Consume deltas manually so we can also capture the generator's return
  // value (the full text) without re-accumulating it here.
  while (true) {
    const { done, value } = await stream.next();
    if (done) {
      text = value;
      break;
    }
    for (const level of extractor.push(value)) {
      yield { type: "level", level, index: index++ };
    }
  }

  if (!text) throw new Error("Roadmap generation returned no text.");
  const parsed = JSON.parse(text) as { levels: SkeletonLevel[] };
  if (!parsed.levels?.length) {
    throw new Error("Roadmap generation returned no levels.");
  }
  yield { type: "done", levels: parsed.levels };
}
