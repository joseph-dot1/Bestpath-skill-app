import "server-only";

import Anthropic from "@anthropic-ai/sdk";

// Model tiering (see spec §4): Sonnet for long/structured generation and
// assessment adaptivity, Haiku for short high-volume calls (re-ranking,
// quizzes). Centralized so upgrading tiers is a one-line change.
export const MODELS = {
  reasoning: "claude-sonnet-5",
  fast: "claude-haiku-4-5",
} as const;

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!isAnthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}
