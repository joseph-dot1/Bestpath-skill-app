import "server-only";

import * as anthropic from "./anthropic";
import * as gemini from "./gemini";

// ---------------------------------------------------------------------------
// Provider-agnostic LLM layer.
//
// Two tiers, mapped per provider:
//   "reasoning" — long structured generation (roadmaps, assessment, checkpoints)
//   "fast"      — short high-volume calls (quizzes, re-ranking, topic mapping)
//
// Default provider is Gemini (free tier, no card required). Set
// LLM_PROVIDER=anthropic (with ANTHROPIC_API_KEY) to switch — no call-site
// changes needed.
// ---------------------------------------------------------------------------

export type LlmTier = "reasoning" | "fast";

export type StructuredRequest = {
  tier: LlmTier;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

type Provider = {
  name: string;
  isConfigured(): boolean;
  generateStructured(req: StructuredRequest): Promise<string>;
  streamStructured(req: StructuredRequest): AsyncGenerator<string, string>;
};

const PROVIDERS: Record<string, Provider> = {
  gemini,
  anthropic,
};

function activeProvider(): Provider {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced) {
    const p = PROVIDERS[forced];
    if (!p) throw new Error(`Unknown LLM_PROVIDER "${forced}" (use gemini or anthropic)`);
    return p;
  }
  // Auto-detect: prefer whichever key is present; Gemini wins ties (free).
  if (gemini.isConfigured()) return gemini;
  if (anthropic.isConfigured()) return anthropic;
  return gemini; // will fail with a clear message at call time
}

export function isLlmConfigured(): boolean {
  return gemini.isConfigured() || anthropic.isConfigured();
}

export function llmDescription(): string {
  return activeProvider().name;
}

export const LLM_NOT_CONFIGURED_MESSAGE =
  "No AI provider configured — set GEMINI_API_KEY (free at aistudio.google.com) or ANTHROPIC_API_KEY.";

/**
 * Turn a caught generation error into a user-facing message. Rate-limit
 * errors get their own clear "busy, try again" text; everything else uses
 * the caller's fallback.
 */
export function llmErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.name === "RateLimitedError") {
    return err.message;
  }
  return fallback;
}

/** One-shot structured JSON generation. Returns the raw JSON string. */
export function generateStructured(req: StructuredRequest): Promise<string> {
  return activeProvider().generateStructured(req);
}

/**
 * Streaming structured JSON generation: yields text deltas as they arrive
 * (for incremental parsing) and returns the complete text.
 */
export function streamStructured(
  req: StructuredRequest,
): AsyncGenerator<string, string> {
  return activeProvider().streamStructured(req);
}
