// LLM provider-routing layer.
//
// Single entry point (`callLLM`) for ALL text-generation calls. Routes to Google
// Gemini or Anthropic Claude based on the `model` id. Every call site passes a
// model and the relevant API key(s); provider differences live only in here.
//
// NOT handled here: embeddings. Anthropic has no embeddings API, so embedding
// generation always stays on Google — see _shared/embeddings.ts.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Max output-token ceiling per Claude model. Used to clamp `max_tokens` so an
// oversized request never 400s. Values are the documented output limits.
const ANTHROPIC_MAX_OUTPUT: Record<string, number> = {
  "claude-opus-4-7": 128000,
  "claude-sonnet-4-6": 64000,
  "claude-haiku-4-5": 64000,
};

export const DEFAULT_MODEL = "gemini-2.5-pro";

// Models the UI may select. The label is shown to the user; the id is sent to
// the edge function and routed here.
export const SUPPORTED_MODELS: Array<{ id: string; label: string; provider: "google" | "anthropic" }> = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic" },
];

export interface LLMConfig {
  model: string;            // e.g. 'gemini-2.5-pro' | 'claude-opus-4-7'
  googleApiKey: string;     // always required (embeddings + Gemini generation)
  anthropicApiKey?: string; // required only when a Claude model is selected
}

export interface LLMCallOptions {
  system?: string;          // stable instruction prefix; cached on Claude
  maxOutputTokens?: number;
  temperature?: number;     // applied to Gemini only; omitted for Claude
  signal?: AbortSignal;
}

export function isClaudeModel(model?: string): boolean {
  return !!model && model.toLowerCase().startsWith("claude");
}

/**
 * Generate text from the configured model. Returns the response text (possibly
 * empty). Throws on HTTP/transport errors so callers can apply their own
 * fallback behavior.
 */
export async function callLLM(
  prompt: string,
  llm: LLMConfig,
  opts: LLMCallOptions = {},
): Promise<string> {
  const model = llm.model || DEFAULT_MODEL;
  if (isClaudeModel(model)) {
    return await callAnthropic(prompt, model, llm.anthropicApiKey, opts);
  }
  return await callGemini(prompt, model, llm.googleApiKey, opts);
}

async function callGemini(
  prompt: string,
  model: string,
  apiKey: string | undefined,
  opts: LLMCallOptions,
): Promise<string> {
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");

  const text = opts.system ? `${opts.system}\n\n${prompt}` : prompt;
  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
  if (opts.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = opts.maxOutputTokens;

  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig,
      }),
      signal: opts.signal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic(
  prompt: string,
  model: string,
  apiKey: string | undefined,
  opts: LLMCallOptions,
): Promise<string> {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured (required for Claude models)");
  }

  const cap = ANTHROPIC_MAX_OUTPUT[model] ?? 32000;
  const maxTokens = Math.min(opts.maxOutputTokens ?? 4096, cap);

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };

  // Pass the stable instruction prefix as a cached system block. Across the
  // per-topic calls in one assessment run the system text is identical, so
  // subsequent calls read it from cache.
  if (opts.system) {
    body.system = [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }];
  }

  // temperature / thinking / effort are intentionally omitted: Opus 4.7 rejects
  // `temperature` (400), and `effort` errors on Haiku 4.5. Omitting them keeps a
  // single request shape valid across all selectable Claude models.

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(data.content) ? data.content : [];
  return blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("");
}
