/**
 * Core contracts (DESIGN §5). These interfaces are load-bearing and imported by
 * both server and client. Pin them first; the rest is fill-in.
 */

/** Real providers a visitor can supply a key for. The `stub` provider is the
 *  degradation floor and never has a key (DESIGN §3.4). */
export type ProviderId = "anthropic" | "openai";

/** Per-model token pricing, in USD per million tokens (DESIGN §10). */
export interface PricePerMTok {
  input: number;
  output: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** A model the playground/harness can target. `id` is the vendor's model string. */
export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  meta: { contextWindow: number; pricing: PricePerMTok };
}

export interface GenRequest {
  model: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  apiKey?: string; // BYOK — passed through, never stored (DESIGN §3.1)
  signal?: AbortSignal; // abort when the pane/panel closes
}

/** Unified streaming + non-streaming provider. Each per-provider file is the
 *  anti-corruption layer normalizing that vendor's SSE into our delta shape. */
export interface Provider {
  id: ProviderId | "stub";
  stream(req: GenRequest): AsyncGenerator<{ delta: string }>; // playground + agentic
  complete(req: GenRequest): Promise<{ text: string; usage: Usage }>; // llm-judge
  meta: { contextWindow: number; pricing: PricePerMTok };
}

/**
 * StreamFrame — the single source of truth for the wire format (DESIGN §5.2).
 * One discriminated union, handled EXHAUSTIVELY with a `never` guard on both
 * sides so adding a frame kind is a compile error until every site handles it.
 */
export type StreamFrame =
  | { type: "delta"; modelId: string; text: string }
  | { type: "cell_done"; modelId: string; caseId: string; results: GraderResult[] }
  | { type: "done"; modelId: string; latencyMs: number; tokens: number; costUsd: number }
  | { type: "error"; modelId: string; message: string };

/** The output of one model on one case — what graders receive. */
export interface ModelOutput {
  modelId: string;
  caseId: string;
  text: string;
  latencyMs: number;
  tokens: number;
  costUsd: number;
}

/** Grader result — discriminated union, rendered exhaustively by ResultBadge. */
export type GraderResult =
  | { kind: "exact_match"; passed: boolean; expected: string; got: string }
  | { kind: "regex"; passed: boolean; pattern: string }
  | { kind: "json_schema"; passed: boolean; errors: string[] }
  | { kind: "latency"; passed: boolean; latencyMs: number; thresholdMs: number }
  | { kind: "cost"; passed: boolean; costUsd: number; thresholdUsd: number }
  | { kind: "llm_judge"; score: number; reasoning: string; rubric: string };

export type GraderKind = GraderResult["kind"];

/** Generic grader. `deterministic: true` graders are cheap/free and run first;
 *  they can short-circuit before the paid LLM-judge (DESIGN §5.3). */
export interface Grader<C = unknown> {
  kind: GraderKind;
  deterministic: boolean;
  grade(output: ModelOutput, config: C): Promise<GraderResult>;
}
