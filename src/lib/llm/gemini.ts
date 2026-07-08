import "server-only";

import type { StructuredRequest } from "./index";

// ---------------------------------------------------------------------------
// Google Gemini provider (REST — no SDK dependency).
//
// Free tier via aistudio.google.com: no card required. Defaults target the
// free-tier workhorses; override per env when newer models ship:
//   GEMINI_REASONING_MODEL (default gemini-2.5-flash)
//   GEMINI_FAST_MODEL      (default gemini-2.5-flash-lite)
// ---------------------------------------------------------------------------

export const name = "gemini";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MODELS = {
  reasoning: process.env.GEMINI_REASONING_MODEL ?? "gemini-2.5-flash",
  fast: process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash-lite",
} as const;

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  return key;
}

// ---------------------------------------------------------------------------
// Schema translation. Gemini's responseSchema is an OpenAPI-style subset:
// no `const`, no `additionalProperties`. Translate what we can and drop the
// rest — responseMimeType still forces valid JSON output.
// ---------------------------------------------------------------------------
const ALLOWED_KEYS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "anyOf",
  "description",
  "nullable",
]);

export function sanitizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForGemini);
  if (node === null || typeof node !== "object") return node;

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (key === "const") {
      // const X → enum [X]
      out.enum = [value];
      if (!("type" in src)) out.type = typeof value === "number" ? "number" : "string";
      continue;
    }
    if (!ALLOWED_KEYS.has(key)) continue; // e.g. additionalProperties
    if (key === "properties") {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        props[k] = sanitizeSchemaForGemini(v);
      }
      out.properties = props;
    } else if (key === "items" || key === "anyOf") {
      out[key] = sanitizeSchemaForGemini(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildBody(
  req: StructuredRequest,
  schema: unknown | null,
  withThinkingConfig = true,
) {
  // Gemini 2.5 models "think" before answering by default, which adds a long
  // silent delay before the first token. Structured generation here doesn't
  // need it — disable for speed (override via GEMINI_THINKING_BUDGET).
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET ?? 0);

  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      responseMimeType: "application/json",
      // Dropped on the 400 fallback in case a model rejects thinkingConfig.
      ...(withThinkingConfig ? { thinkingConfig: { thinkingBudget } } : {}),
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
}

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

async function callWithRetry(url: string, body: object): Promise<Response> {
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    // Free-tier rate limits (RPM) surface as 429 — back off and retry.
    if (res.status === 429 || res.status === 503) {
      lastError = `${res.status}: ${await res.text().catch(() => "")}`;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    }
    return res;
  }
  throw new Error(`Gemini rate-limited after retries (${lastError.slice(0, 200)})`);
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

function extractText(data: GeminiResponse): string {
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason: ${candidate?.finishReason ?? "?"}, block: ${data.promptFeedback?.blockReason ?? "none"})`,
    );
  }
  return text;
}

export async function generateStructured(req: StructuredRequest): Promise<string> {
  const model = MODELS[req.tier];
  const url = `${API_BASE}/${model}:generateContent`;
  const schema = sanitizeSchemaForGemini(req.schema);

  let res = await callWithRetry(url, buildBody(req, schema));
  if (res.status === 400) {
    // Schema or thinkingConfig rejected → retry as plain JSON mode.
    res = await callWithRetry(url, buildBody(req, null, false));
  }
  if (!res.ok) {
    throw new Error(`Gemini ${model} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return extractText((await res.json()) as GeminiResponse);
}

export async function* streamStructured(
  req: StructuredRequest,
): AsyncGenerator<string, string> {
  const model = MODELS[req.tier];
  const url = `${API_BASE}/${model}:streamGenerateContent?alt=sse`;
  const schema = sanitizeSchemaForGemini(req.schema);

  let res = await callWithRetry(url, buildBody(req, schema));
  if (res.status === 400) {
    res = await callWithRetry(url, buildBody(req, null, false));
  }
  if (!res.ok || !res.body) {
    throw new Error(`Gemini ${model} stream failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  // Parse the SSE stream: `data: {json}` chunks, each carrying a text delta.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as GeminiResponse;
        const delta = (chunk.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("");
        if (delta) {
          full += delta;
          yield delta;
        }
      } catch {
        // Partial/keepalive line — ignore.
      }
    }
  }

  if (!full) throw new Error("Gemini stream produced no text.");
  return full;
}
