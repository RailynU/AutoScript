import { z } from "zod";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatResult {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  /** Aborts the provider request (e.g. the per-analysis deadline). */
  signal?: AbortSignal;
}

export interface EmbedOptions {
  signal?: AbortSignal;
}

/** Minimal interface so the pipeline can be tested with a fake. */
export interface LlmClient {
  readonly configured: boolean;
  readonly model: string;
  readonly visionModel: string;
  chatJson(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][] | null>;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM provider is not configured. Set LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL) in .env.");
    this.name = "LlmNotConfiguredError";
  }
}

/** The provider answered with a non-2xx status; `message` is safe to show to a pharmacist. */
export class LlmProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  visionModel: string;
  timeoutMs: number;
  embedding?: { baseUrl: string; apiKey?: string; model: string };
  appName?: string;
  /** Delay before the single retry on a retryable status. */
  retryDelayMs?: number;
}

const ChatResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.union([z.string(), z.null()]).optional() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number().optional() })),
});

const PROVIDER_MESSAGE_MAX_CHARS = 200;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const DEFAULT_RETRY_DELAY_MS = 1500;
const MIN_SECRET_LENGTH = 8;

/** Replace every occurrence of a configured secret with "[redacted]". */
export function redactSecrets(text: string, secrets: ReadonlyArray<string | undefined>): string {
  return secrets.reduce<string>((acc, secret) => (secret && secret.length >= MIN_SECRET_LENGTH ? acc.split(secret).join("[redacted]") : acc), text);
}

/** The provider's own message if the body is OpenAI-style JSON, otherwise the raw text. */
function providerMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
    const candidate = typeof json.error === "string" ? json.error : json.error?.message ?? json.message;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  } catch {
    /* not JSON */
  }
  return body;
}

/** Readable failure for a non-2xx provider response: status, the provider's message (truncated), never a secret. */
export function formatProviderError(status: number, statusText: string, body: string, secrets: ReadonlyArray<string | undefined>, attempts = 1): string {
  const detail = redactSecrets(providerMessage(body).replace(/\s+/g, " ").trim(), secrets).slice(0, PROVIDER_MESSAGE_MAX_CHARS);
  const label = status === 429 ? "rate limited the request" : status >= 500 ? "returned a server error" : "rejected the request";
  const suffix = attempts > 1 ? ` after ${attempts} attempts` : "";
  return `LLM provider ${label} (HTTP ${status}${statusText ? ` ${statusText}` : ""})${suffix}${detail ? `: ${detail}` : ""}`;
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}

/** Map a fetch rejection to a readable error that never echoes the request (URL, headers, body). */
function describeFetchFailure(err: unknown, timeoutMs: number, secrets: ReadonlyArray<string | undefined>, external?: AbortSignal): Error {
  if (external?.aborted) {
    const reason: unknown = external.reason;
    return reason instanceof Error ? reason : new Error(redactSecrets(String(reason ?? "Analysis aborted"), secrets));
  }
  const name = (err as { name?: unknown })?.name;
  if (name === "TimeoutError" || name === "AbortError") return new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)} s (LLM_TIMEOUT_MS)`);
  const cause = (err as { cause?: { code?: unknown; message?: unknown } })?.cause;
  const detail = typeof cause?.code === "string" ? cause.code : typeof cause?.message === "string" ? cause.message : err instanceof Error ? err.message : String(err);
  return new Error(`Could not reach the LLM provider: ${redactSecrets(detail, secrets).slice(0, PROVIDER_MESSAGE_MAX_CHARS)}`);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** OpenAI-compatible chat + embeddings client (works with OpenRouter, OpenAI, local servers). */
export class OpenAiCompatibleClient implements LlmClient {
  readonly configured: boolean;
  readonly model: string;
  readonly visionModel: string;
  private embeddingsDisabled = false;
  private readonly secrets: ReadonlyArray<string | undefined>;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.configured = Boolean(opts.apiKey);
    this.model = opts.model;
    this.visionModel = opts.visionModel;
    this.secrets = [opts.apiKey, opts.embedding?.apiKey];
  }

  async chatJson(messages: ChatMessage[], o: ChatOptions = {}): Promise<ChatResult> {
    if (!this.opts.apiKey) throw new LlmNotConfiguredError();
    const started = Date.now();
    const model = o.model ?? this.model;
    const body = JSON.stringify({ model, messages, temperature: 0.1, max_tokens: o.maxTokens ?? 4000, response_format: { type: "json_object" } });
    let res = await this.postChat(body, o.signal);
    let attempts = 1;
    if (!res.ok && RETRYABLE_STATUSES.has(res.status)) {
      await sleep(this.opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, o.signal).catch((reason: unknown) => {
        throw describeFetchFailure(reason, this.opts.timeoutMs, this.secrets, o.signal);
      });
      res = await this.postChat(body, o.signal);
      attempts = 2;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LlmProviderError(res.status, formatProviderError(res.status, res.statusText, text, this.secrets, attempts));
    }
    const json = await this.parseChatBody(res);
    const content = json.choices[0]?.message.content ?? "";
    if (!content.trim()) throw new Error("LLM returned an empty response");
    return {
      content,
      model: json.model ?? model,
      promptTokens: json.usage?.prompt_tokens ?? null,
      completionTokens: json.usage?.completion_tokens ?? null,
      durationMs: Date.now() - started,
    };
  }

  private async postChat(body: string, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": this.opts.appName ?? "AutoScript (local demo)",
        },
        body,
        signal: combineSignals(this.opts.timeoutMs, signal),
      });
    } catch (err) {
      throw describeFetchFailure(err, this.opts.timeoutMs, this.secrets, signal);
    }
  }

  private async parseChatBody(res: Response): Promise<z.infer<typeof ChatResponseSchema>> {
    const raw: unknown = await res.json().catch(() => {
      throw new Error(`LLM provider returned a non-JSON body with HTTP ${res.status}`);
    });
    const parsed = ChatResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new Error(`LLM provider returned an unexpected response shape: ${issues.slice(0, PROVIDER_MESSAGE_MAX_CHARS)}`);
    }
    return parsed.data;
  }

  /** Returns null when embeddings are not configured or the provider rejects the call (caller falls back to lexical search). */
  async embed(texts: string[], o: EmbedOptions = {}): Promise<number[][] | null> {
    const cfg = this.opts.embedding;
    if (!cfg || !cfg.apiKey || this.embeddingsDisabled || texts.length === 0) return null;
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input: texts }),
        signal: combineSignals(this.opts.timeoutMs, o.signal),
      });
      if (!res.ok) {
        this.embeddingsDisabled = res.status === 401 || res.status === 403 || res.status === 404;
        return null;
      }
      const parsed = EmbeddingResponseSchema.parse(await res.json());
      const sorted = [...parsed.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return sorted.map((d) => d.embedding);
    } catch {
      return null;
    }
  }
}

/** Extract the first JSON object from a model response that may include code fences or prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Model response did not contain a JSON object");
  }
}
