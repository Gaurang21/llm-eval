import type { GraderResult, ModelOutput } from "../types";
import { assertNever } from "../utils";
import type { GraderConfig } from "./types";
import {
  exactMatchGrader,
  regexGrader,
  jsonSchemaGrader,
  latencyGrader,
  costGrader,
} from "./deterministic";
import { createLlmJudge, type CompleteFn } from "./llmJudge";

/**
 * Grader registry + runner (DESIGN §5.3). Deterministic graders are static and
 * looked up by kind. The runner enforces the ordering rule: deterministic
 * checks run FIRST, and if any of them fails the case has already failed
 * cheaply — we short-circuit and skip the paid LLM-judge.
 */

/** Dispatch one config to its grader, narrowed exhaustively by kind. `judge`
 *  is only needed for llm_judge; deterministic kinds ignore it. */
async function gradeOne(
  config: GraderConfig,
  output: ModelOutput,
  judge?: CompleteFn,
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
    case "llm_judge": {
      if (!judge) {
        // No judge client available — report as a non-passing judge result
        // rather than throwing, so the run still completes.
        return {
          kind: "llm_judge",
          score: 0,
          reasoning: "judge unavailable (no model client provided)",
          rubric: config.rubric,
        };
      }
      return createLlmJudge(judge).grade(output, config);
    }
    default:
      return assertNever(config, "GraderConfig");
  }
}

/**
 * Run a case's graders in the right order. Returns every result produced;
 * when a deterministic grader fails, the LLM-judge is skipped (short-circuit).
 */
export async function gradeOutput(
  output: ModelOutput,
  configs: GraderConfig[],
  judge?: CompleteFn,
): Promise<GraderResult[]> {
  const deterministic = configs.filter((c) => c.kind !== "llm_judge");
  const judges = configs.filter((c) => c.kind === "llm_judge");

  const detResults: GraderResult[] = [];
  for (const c of deterministic) {
    detResults.push(await gradeOne(c, output));
  }

  const anyDetFailed = detResults.some(
    (r) => "passed" in r && r.passed === false,
  );

  // Short-circuit: don't spend on the judge if a cheap check already failed.
  if (anyDetFailed || judges.length === 0) return detResults;

  const judgeResults: GraderResult[] = [];
  for (const c of judges) {
    judgeResults.push(await gradeOne(c, output, judge));
  }
  return [...detResults, ...judgeResults];
}
