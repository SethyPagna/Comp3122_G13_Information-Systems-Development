/**
 * OpenRouter AI client
 * Uses the OpenAI-compatible chat completions endpoint.
 * Model: stepfun/step-3.5-flash:free  (free tier, no usage cost)
 * Docs: https://openrouter.ai/docs
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = "stepfun/step-3.5-flash:free";

interface OpenRouterErrorShape {
  message?: string;
}

interface OpenRouterContentPart {
  type?: string;
  text?: string;
  content?: string;
  value?: string;
}

interface OpenRouterChoiceMessage {
  content?: string | OpenRouterContentPart[] | OpenRouterContentPart;
}

interface OpenRouterChoice {
  message?: OpenRouterChoiceMessage;
  text?: string;
  finish_reason?: string | null;
}

interface OpenRouterResponse {
  error?: OpenRouterErrorShape;
  choices?: OpenRouterChoice[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Override model (defaults to step-3.5-flash:free) */
  model?: string;
}

function extractTextFromChoice(choice?: OpenRouterChoice): string {
  if (!choice) return "";

  const content = choice.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const objText =
      (typeof content.text === "string" && content.text) ||
      (typeof content.content === "string" && content.content) ||
      (typeof content.value === "string" && content.value) ||
      "";
    if (objText.trim()) return objText.trim();
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        if (typeof part?.value === "string") return part.value;
        return "";
      })
      .join("")
      .trim();
    if (combined) return combined;
  }

  if (typeof choice.text === "string" && choice.text.trim()) {
    return choice.text.trim();
  }

  return "";
}

/**
 * Call OpenRouter and return the assistant message text.
 * Throws on non-200 responses with a descriptive error.
 */
export async function openRouterChat(opts: OpenRouterOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in .env.local");

  const baseMaxTokens = opts.maxTokens ?? 1000;
  const baseTemperature = opts.temperature ?? 0.7;
  const maxAttempts = 3;

  let attemptMaxTokens = baseMaxTokens;
  let attemptTemperature = baseTemperature;
  let lastFinishReason = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter recommends these headers for analytics / free-tier access
        "HTTP-Referer": "https://atlas-learning.app",
        "X-Title": "Atlas Learning Platform",
      },
      body: JSON.stringify({
        model: opts.model ?? MODEL,
        max_tokens: attemptMaxTokens,
        temperature: attemptTemperature,
        messages: opts.messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as OpenRouterResponse;

    // Handle both standard and error shapes
    if (data.error) {
      throw new Error(
        `OpenRouter API error: ${data.error.message ?? JSON.stringify(data.error)}`,
      );
    }

    const choice = data.choices?.[0];
    const text = extractTextFromChoice(choice);
    if (text) return text;

    const finishReason = choice?.finish_reason ?? "unknown";
    lastFinishReason = finishReason;

    const isLastAttempt = attempt >= maxAttempts;
    if (isLastAttempt) {
      throw new Error(
        `OpenRouter returned an empty response (finish_reason: ${finishReason})`,
      );
    }

    // If the provider indicates token exhaustion, give the next attempt more room.
    if (finishReason === "length") {
      attemptMaxTokens = Math.min(
        Math.max(attemptMaxTokens + 600, Math.floor(baseMaxTokens * 1.25)),
        4000,
      );
      attemptTemperature = Math.min(baseTemperature, 0.3);
      continue;
    }

    attemptMaxTokens = Math.max(256, Math.floor(attemptMaxTokens * 0.75));
    attemptTemperature = Math.min(baseTemperature, 0.4);
  }

  throw new Error(
    `OpenRouter returned an empty response (finish_reason: ${lastFinishReason})`,
  );
}

/**
 * Strip markdown code fences from a response and parse JSON.
 * Useful when the model wraps JSON in ```json ... ```
 */
export function parseJsonResponse<T>(raw: string): T {
  let clean = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Some models prepend explanatory text before the JSON — find the first {
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    clean = clean.slice(start, end + 1);
  }
  return JSON.parse(clean) as T;
}
