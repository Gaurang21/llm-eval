import type { GraderResult, ModelOutput } from "../types";
import type { TypedGrader } from "./types";

/**
 * Deterministic graders (DESIGN §5.3): cheap, free, local checks. They run
 * first and can short-circuit before the paid LLM-judge. Each is a small,
 * self-contained `Grader` — adding one is a new export + a registry entry.
 */

export const exactMatchGrader: TypedGrader<"exact_match"> = {
  kind: "exact_match",
  deterministic: true,
  async grade(output: ModelOutput, config): Promise<GraderResult> {
    const norm = (s: string) =>
      config.caseInsensitive ? s.trim().toLowerCase() : s.trim();
    const got = output.text;
    return {
      kind: "exact_match",
      passed: norm(got) === norm(config.expected),
      expected: config.expected,
      got: got.length > 120 ? got.slice(0, 117) + "…" : got,
    };
  },
};

export const regexGrader: TypedGrader<"regex"> = {
  kind: "regex",
  deterministic: true,
  async grade(output: ModelOutput, config): Promise<GraderResult> {
    let passed = false;
    try {
      passed = new RegExp(config.pattern, config.flags).test(output.text);
    } catch {
      passed = false; // invalid pattern → fail closed
    }
    return { kind: "regex", passed, pattern: config.pattern };
  },
};

export const jsonSchemaGrader: TypedGrader<"json_schema"> = {
  kind: "json_schema",
  deterministic: true,
  async grade(output: ModelOutput, config): Promise<GraderResult> {
    const errors: string[] = [];
    const text = stripFences(output.text).trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { kind: "json_schema", passed: false, errors: ["not valid JSON"] };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { kind: "json_schema", passed: false, errors: ["expected a JSON object"] };
    }
    const obj = parsed as Record<string, unknown>;
    for (const key of config.required) {
      if (!(key in obj)) errors.push(`missing required key: ${key}`);
    }
    return { kind: "json_schema", passed: errors.length === 0, errors };
  },
};

export const latencyGrader: TypedGrader<"latency"> = {
  kind: "latency",
  deterministic: true,
  async grade(output: ModelOutput, config): Promise<GraderResult> {
    return {
      kind: "latency",
      passed: output.latencyMs <= config.thresholdMs,
      latencyMs: output.latencyMs,
      thresholdMs: config.thresholdMs,
    };
  },
};

export const costGrader: TypedGrader<"cost"> = {
  kind: "cost",
  deterministic: true,
  async grade(output: ModelOutput, config): Promise<GraderResult> {
    return {
      kind: "cost",
      passed: output.costUsd <= config.thresholdUsd,
      costUsd: output.costUsd,
      thresholdUsd: config.thresholdUsd,
    };
  },
};

/** Strip ```json fences before parsing (defensive — models love fences). */
export function stripFences(text: string): string {
  return text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1");
}
