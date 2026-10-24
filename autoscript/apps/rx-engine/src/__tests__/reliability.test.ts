import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyzeRequest, EngineCallback } from "@autoscript/shared";
import { formatProviderError, OpenAiCompatibleClient, redactSecrets, type ChatMessage, type ChatOptions, type ChatResult } from "../llm/client.js";
import { AnalysisTimeoutError, runPipeline } from "../pipeline.js";
import { createRagPool, ensureRagSchema, type RagPool } from "../rag/db.js";
import { Retriever } from "../rag/retrieve.js";
import { FakeLlm } from "./fakeLlm.js";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://autoscript:autoscript@localhost:5433/autoscript_test";
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };
const request: AnalyzeRequest = { prescriptionId: "rx-deadline", callbackUrl: "http://localhost:0/cb", source: { kind: "text", text: "Ibuprofen 600 mg" }, patient: null };

/** chatJson never resolves on its own; with `honorSignal` it rejects when the pipeline's deadline aborts it. */
class HangingLlm extends FakeLlm {
  signals: Array<AbortSignal | undefined> = [];
  constructor(private readonly honorSignal: boolean) {
    super([]);
  }
  override chatJson(_messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    this.signals.push(opts.signal);
    return new Promise((_, reject) => {
      if (this.honorSignal) opts.signal?.addEventListener("abort", () => reject(opts.signal?.reason), { once: true });
    });
  }
}

let pool: RagPool;
beforeAll(async () => {
  pool = createRagPool(TEST_DB);
  await ensureRagSchema(pool);
});
afterAll(async () => pool.end());

describe("per-analysis deadline", () => {
  it.each([
    ["a provider call that honors the abort signal", true],
    ["a provider call that ignores the signal entirely", false],
  ])("%s ends in a failed callback at the deadline, not a hang", async (_label, honorSignal) => {
    const llm = new HangingLlm(honorSignal);
    const callbacks: EngineCallback[] = [];
    const started = Date.now();
    const report = await runPipeline({ llm, retriever: new Retriever(pool, llm), send: async (cb) => void callbacks.push(cb), log: silentLog }, request, { timeoutMs: 60 });
    const elapsed = Date.now() - started;

    expect(report).toBeNull();
    expect(elapsed).toBeLessThan(2000);
    expect(llm.signals[0]).toBeInstanceOf(AbortSignal);
    expect(llm.signals[0]!.aborted).toBe(true);
    expect(llm.signals[0]!.reason).toBeInstanceOf(AnalysisTimeoutError);
    const failed = callbacks.find((c) => c.type === "failed");
    expect(failed && failed.type === "failed" ? failed : null).toMatchObject({ stage: "EXTRACTING", error: "Analysis timed out after 0 s (ANALYSIS_TIMEOUT_MS): the LLM provider did not answer in time. Retry from the detail page." });
    expect(callbacks.filter((c) => c.type !== "progress")).toHaveLength(1);
    expect(callbacks.at(-1)?.type).toBe("failed");
  });

  it("without a deadline the pipeline still completes a normal run's failure path explicitly", async () => {
    const callbacks: EngineCallback[] = [];
    const llm = new FakeLlm([new Error("boom from provider")]);
    await runPipeline({ llm, retriever: new Retriever(pool, llm), send: async (cb) => void callbacks.push(cb), log: silentLog }, request);
    const failed = callbacks.find((c) => c.type === "failed");
    expect(failed && failed.type === "failed" && failed.error).toBe("boom from provider");
  });
});

describe("provider errors are readable and never carry the key", () => {
  const KEY = "sk-or-v1-test-secret-key-0123456789";
  let server: Server;
  let baseUrl: string;
  let mode: "429" | "503-then-ok" | "hang" | "html" = "429";
  let hits = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits += 1;
      const auth = req.headers.authorization ?? "";
      if (mode === "hang") return;
      if (mode === "html") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html>upstream proxy page</html>");
      }
      if (mode === "503-then-ok" && hits >= 2) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ model: "fake", choices: [{ message: { content: '{"ok":true}' } }] }));
      }
      const status = mode === "429" ? 429 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Rate limit exceeded for ${auth}. ${"x".repeat(400)}`, code: status } }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => new Promise<void>((r) => server.close(() => r())));

  const client = () => new OpenAiCompatibleClient({ baseUrl, apiKey: KEY, model: "m", visionModel: "m", timeoutMs: 5000, retryDelayMs: 10 });
  const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

  it("429 twice: status, retry count and the provider message truncated to 200 chars, key redacted", async () => {
    mode = "429";
    hits = 0;
    const err = await client().chatJson(messages).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/^LLM provider rate limited the request \(HTTP 429[^)]*\) after 2 attempts: Rate limit exceeded for Bearer \[redacted\]\. x+$/);
    expect(message).not.toContain(KEY);
    expect(message.split(": ").slice(1).join(": ").length).toBeLessThanOrEqual(200);
    expect(hits).toBe(2);
  });

  it("503 then 200: the single retry recovers", async () => {
    mode = "503-then-ok";
    hits = 0;
    const res = await client().chatJson(messages);
    expect(res.content).toBe('{"ok":true}');
    expect(hits).toBe(2);
  });

  it("a non-JSON 200 body is reported as an unexpected response, not a crash", async () => {
    mode = "html";
    await expect(client().chatJson(messages)).rejects.toThrow(/non-JSON body with HTTP 200/);
  });

  it("an external abort (the analysis deadline) rejects with that reason, not a hang", async () => {
    mode = "hang";
    const controller = new AbortController();
    setTimeout(() => controller.abort(new AnalysisTimeoutError(150_000)), 30);
    const err = await client().chatJson(messages, { signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalysisTimeoutError);
    expect(String((err as Error).message)).not.toContain(KEY);
  });

  it("the per-request LLM_TIMEOUT_MS still applies without an external signal", async () => {
    mode = "hang";
    const slow = new OpenAiCompatibleClient({ baseUrl, apiKey: KEY, model: "m", visionModel: "m", timeoutMs: 40 });
    await expect(slow.chatJson(messages)).rejects.toThrow(/LLM request timed out after 0 s \(LLM_TIMEOUT_MS\)/);
  });

  it("formatProviderError and redactSecrets are pure and bounded", () => {
    expect(formatProviderError(502, "Bad Gateway", "<html>oops</html>", [KEY])).toBe("LLM provider returned a server error (HTTP 502 Bad Gateway): <html>oops</html>");
    expect(formatProviderError(401, "", JSON.stringify({ error: { message: `bad key ${KEY}` } }), [KEY])).toBe("LLM provider rejected the request (HTTP 401): bad key [redacted]");
    expect(formatProviderError(429, "", "", [])).toBe("LLM provider rate limited the request (HTTP 429)");
    expect(redactSecrets("short key abc", ["abc"])).toBe("short key abc");
    expect(formatProviderError(500, "", "y".repeat(1000), []).length).toBeLessThanOrEqual("LLM provider returned a server error (HTTP 500): ".length + 200);
  });
});
