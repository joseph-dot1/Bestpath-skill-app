import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { StructuredRequest } from "./index";

// ---------------------------------------------------------------------------
// Anthropic provider. Paid, highest quality — switch to it with
// LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY when there's budget.
// ---------------------------------------------------------------------------

export const name = "anthropic";

const MODELS = {
  reasoning: process.env.ANTHROPIC_REASONING_MODEL ?? "claude-sonnet-5",
  fast: process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5",
} as const;

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isConfigured()) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (!client) client = new Anthropic();
  return client;
}

export async function generateStructured(req: StructuredRequest): Promise<string> {
  const response = await getClient().messages.create({
    model: MODELS[req.tier],
    max_tokens: req.maxTokens,
    system: req.system,
    output_config: { format: { type: "json_schema", schema: req.schema } },
    messages: [{ role: "user", content: req.user }],
  });
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) {
    throw new Error(`Anthropic returned no text (stop_reason: ${response.stop_reason})`);
  }
  return text;
}

export async function* streamStructured(
  req: StructuredRequest,
): AsyncGenerator<string, string> {
  const stream = getClient().messages.stream({
    model: MODELS[req.tier],
    max_tokens: req.maxTokens,
    system: req.system,
    output_config: { format: { type: "json_schema", schema: req.schema } },
    messages: [{ role: "user", content: req.user }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  const text = final.content.find((b) => b.type === "text")?.text;
  if (!text) {
    throw new Error(`Anthropic stream returned no text (stop_reason: ${final.stop_reason})`);
  }
  return text;
}
