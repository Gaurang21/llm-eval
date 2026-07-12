import type { Grader, GraderResult, GraderKind, ModelOutput } from "../types";

export type { Grader, GraderResult, GraderKind, ModelOutput };

/**
 * Grader configs — the per-kind knobs a test case supplies. This is a
 * discriminated union parallel to GraderResult: `kind` selects both the config
 * shape and the grader that consumes it, so the harness can carry a
 * `GraderConfig[]` per case and dispatch it exhaustively.
 */
export type GraderConfig =
  | { kind: "exact_match"; expected: string; caseInsensitive?: boolean }
  | { kind: "regex"; pattern: string; flags?: string }
  | { kind: "json_schema"; required: string[] }
  | { kind: "latency"; thresholdMs: number }
  | { kind: "cost"; thresholdUsd: number }
  | { kind: "embedding_similarity"; reference: string; threshold: number; embedModel?: string }
  | { kind: "llm_judge"; rubric: string; judgeModel?: string; passThreshold?: number }
  | { kind: "agentic_judge"; rubric: string; judgeModel?: string; maxSteps?: number; passThreshold?: number };

/** Narrow a GraderConfig to the config for a specific kind. */
export type ConfigFor<K extends GraderKind> = Extract<GraderConfig, { kind: K }>;

/** A grader whose config is exactly the config for its kind. */
export type TypedGrader<K extends GraderKind> = Grader<ConfigFor<K>>;

/** Did a result pass? LLM-judge has no boolean, so its config carries the
 *  threshold; deterministic results expose `passed` directly. */
export function resultPassed(
  result: GraderResult,
  passThreshold = 0.7,
): boolean {
  switch (result.kind) {
    case "exact_match":
    case "regex":
    case "json_schema":
    case "latency":
    case "cost":
    case "embedding_similarity":
      return result.passed;
    case "llm_judge":
    case "agentic_judge":
      return result.score >= passThreshold;
  }
}
