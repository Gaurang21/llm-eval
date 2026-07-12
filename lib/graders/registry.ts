import type { GraderResult, ModelOutput } from "../types";
import { assertNever } from "../utils";
import type { GraderConfig, GraderKind } from "./types";
import {
  exactMatchGrader,
  regexGrader,
  jsonSchemaGrader,
  latencyGrader,
  costGrader,
} from "./deterministic";
import { createLlmJudge, type CompleteFn } from "./llmJudge";
import { createEmbeddingGrader, type EmbedFn } from "./embedding";
import { createAgenticJudge } from "./agentic";

/**
 * Grader registry + runner (DESIGN §5.3, §8). Deterministic graders are cheap
 * local checks and run FIRST; if any fails, the case has already failed cheaply
 * and we short-circuit the paid graders (embedding call, LLM-judge, agentic
 * loop). Non-deterministic graders receive their model-client deps via `Deps`.
 */

export interface Deps {
  judge?: CompleteFn; // LLM-judge + agentic judge completions
  embed?: EmbedFn; // embedding-similarity vectors
}

const DETERMINISTIC_KINDS: ReadonlySet<GraderKind> = new Set([
  "exact_match",
  "regex",
  "json_schema",
  "latency",
  "cost",
]);

async function gradeOne(
  config: GraderConfig,
  output: ModelOutput,
  deps: Deps,
): Promise<GraderResult> {
  switch (config.kind) {
    case "exact_match":
      return exactMatchGrader.grade(output, config);
    case "regex":
      return regexGrader.grade(output, config);
    case "json_schema":
      return jsonSchemaGrader.grade(output, config);
    case "latency":
      return latencyGrader.grade(output, config);
    case "cost":
      return costGrader.grade(output, config);
    case "embedding_similarity": {
      if (!deps.embed) {
        return {
          kind: "embedding_similarity",
          passed: false,
          similarity: 0,
          threshold: config.threshold,
        };
      }
      return createEmbeddingGrader(deps.embed).grade(output, config);
    }
    case "llm_judge": {
      if (!deps.judge) {
        return {
          kind: "llm_judge",
          score: 0,
          reasoning: "judge unavailable (no model client provided)",
          rubric: config.rubric,
        };
      }
      return createLlmJudge(deps.judge).grade(output, config);
    }
    case "agentic_judge": {
      if (!deps.judge) {
        return {
          kind: "agentic_judge",
          score: 0,
          reasoning: "judge unavailable (no model client provided)",
          steps: [],
          rubric: config.rubric,
        };
      }
      return createAgenticJudge(deps.judge).grade(output, config);
    }
    default:
      return assertNever(config, "GraderConfig");
  }
}

/**
 * Run a case's graders in the right order. Deterministic checks run first; if
 * any fails, the paid non-deterministic graders are skipped (short-circuit).
 */
export async function gradeOutput(
  output: ModelOutput,
  configs: GraderConfig[],
  deps: Deps = {},
): Promise<GraderResult[]> {
  const deterministic = configs.filter((c) => DETERMINISTIC_KINDS.has(c.kind));
  const paid = configs.filter((c) => !DETERMINISTIC_KINDS.has(c.kind));

  const detResults: GraderResult[] = [];
  for (const c of deterministic) {
    detResults.push(await gradeOne(c, output, deps));
  }

  const anyDetFailed = detResults.some(
    (r) => "passed" in r && r.passed === false,
  );
  if (anyDetFailed || paid.length === 0) return detResults;

  const paidResults: GraderResult[] = [];
  for (const c of paid) {
    paidResults.push(await gradeOne(c, output, deps));
  }
  return [...detResults, ...paidResults];
}
