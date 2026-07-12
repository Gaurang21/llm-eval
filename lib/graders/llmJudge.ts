import type { GenRequest, GraderResult, ModelOutput, Usage } from "../types";
import type { TypedGrader } from "./types";
import { stripFences } from "./deterministic";

/**
 * Single-shot LLM-as-judge (DESIGN §5.5). It asks a judge model to score an
 * output against a rubric and return structured JSON. Parsing is defensive:
 * strip ```json fences, then JSON.parse, then clamp/validate — a judge that
 * returns prose instead of JSON degrades to a 0 score with the raw text as
 * reasoning rather than throwing.
 *
 * It is NOT static: the judge needs a way to call a model, so it's constructed
 * with a `complete` fn. The harness wires this to a real provider (with an env
 * key) or to the stub — keeping the grader itself free of key/provider concerns.
 */

export type CompleteFn = (req: GenRequest) => Promise<{ text: string; usage: Usage }>;

const JUDGE_SYSTEM =
  "You are a strict evaluation judge. Score the ASSISTANT OUTPUT against the RUBRIC. " +
  'Respond with ONLY a JSON object of the form {"score": <number 0..1>, "reasoning": "<one sentence>"}. ' +
  "No prose, no markdown fences.";

function buildJudgePrompt(rubric: string, output: ModelOutput): string {
  return [
    `RUBRIC:\n${rubric}`,
    `\nASSISTANT OUTPUT:\n${output.text}`,
    `\nReturn only the JSON object.`,
  ].join("\n");
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Defensive parse of the judge's reply into { score, reasoning }. */
export function parseJudgeReply(raw: string): { score: number; reasoning: string } {
  const cleaned = stripFences(raw).trim();
  try {
    const obj = JSON.parse(cleaned) as { score?: unknown; reasoning?: unknown };
    const score = clamp01(Number(obj.score));
    const reasoning =
      typeof obj.reasoning === "string" && obj.reasoning.trim()
        ? obj.reasoning.trim()
        : "(no reasoning provided)";
    return { score, reasoning };
  } catch {
    // Not JSON — try to salvage a leading number, else fail to 0.
    const m = cleaned.match(/0?\.\d+|[01](?:\.0+)?/);
    return {
      score: m ? clamp01(Number(m[0])) : 0,
      reasoning: cleaned.slice(0, 160) || "judge returned no parseable output",
    };
  }
}

export function createLlmJudge(complete: CompleteFn): TypedGrader<"llm_judge"> {
  return {
    kind: "llm_judge",
    deterministic: false, // paid/slow — runs after deterministic checks
    async grade(output: ModelOutput, config): Promise<GraderResult> {
      const judgeModel = config.judgeModel ?? "claude-sonnet-5";
      const { text } = await complete({
        model: judgeModel,
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: buildJudgePrompt(config.rubric, output) },
        ],
      });
      const { score, reasoning } = parseJudgeReply(text);
      return { kind: "llm_judge", score, reasoning, rubric: config.rubric };
    },
  };
}
