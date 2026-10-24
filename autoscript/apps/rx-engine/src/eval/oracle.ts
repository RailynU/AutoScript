import { groundTruthToExtraction } from "../dataset/us/label.js";
import type { GroundTruth } from "../dataset/us/schema.js";
import { EXTRACTION_SYSTEM_PROMPT, type LlmExtraction } from "../extraction/extract.js";
import type { ChatMessage, ChatResult, LlmClient } from "../llm/client.js";

export const ORACLE_MODEL = "oracle/ground-truth-extraction";
export const LLM_DISABLED_MESSAGE = "LLM disabled for this evaluation run (--no-llm): the contextual analysis step was not executed";

/**
 * Stand-in for the model in --no-llm runs: answers the extraction prompt with the case's known
 * transcription and refuses every other call, so the pipeline runs rules, retrieval and
 * disposition exactly as in production while the AI step is recorded as "did not complete".
 */
export class OracleLlm implements LlmClient {
  readonly configured = true;
  readonly model = ORACLE_MODEL;
  readonly visionModel = ORACLE_MODEL;

  constructor(private readonly extraction: LlmExtraction) {}

  async chatJson(messages: ChatMessage[]): Promise<ChatResult> {
    const system = messages[0];
    if (system?.role === "system" && system.content === EXTRACTION_SYSTEM_PROMPT) {
      return { content: JSON.stringify(this.extraction), model: this.model, promptTokens: null, completionTokens: null, durationMs: 0 };
    }
    throw new Error(LLM_DISABLED_MESSAGE);
  }

  async embed(): Promise<number[][] | null> {
    return null;
  }
}

/** The perfect transcription of a rendered ground truth, in the extractor's output schema (before local normalization). */
export function groundTruthToLlmExtraction(gt: GroundTruth): LlmExtraction {
  const { extractor: _extractor, medications, ...rest } = groundTruthToExtraction(gt);
  return {
    ...rest,
    medications: medications.map(({ normalizedName: _n, normalizationSource: _s, ...m }) => ({ ...m, genericNameGuess: null })),
  };
}
