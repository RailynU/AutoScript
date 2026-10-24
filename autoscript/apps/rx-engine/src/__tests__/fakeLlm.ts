import type { ChatMessage, ChatResult, LlmClient } from "../llm/client.js";

/** Scripted LLM double for tests: returns canned JSON per call, in order. */
export class FakeLlm implements LlmClient {
  readonly configured: boolean;
  readonly model = "fake/test-model";
  readonly visionModel = "fake/test-vision";
  calls: ChatMessage[][] = [];
  constructor(private responses: unknown[], configured = true) {
    this.configured = configured;
  }
  async chatJson(messages: ChatMessage[]): Promise<ChatResult> {
    this.calls.push(messages);
    const next = this.responses.shift();
    if (next === undefined) throw new Error("FakeLlm: no scripted response left");
    if (next instanceof Error) throw next;
    // A function response is computed from the prompt (e.g. to echo a finding id the pipeline generated).
    const value = typeof next === "function" ? (next as (m: ChatMessage[]) => unknown)(messages) : next;
    return { content: typeof value === "string" ? value : JSON.stringify(value), model: this.model, promptTokens: 10, completionTokens: 20, durationMs: 5 };
  }
  async embed(): Promise<number[][] | null> {
    return null;
  }
}
