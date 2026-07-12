import type { AgentStep, GraderResult, ModelOutput } from "../types";
import type { TypedGrader } from "./types";
import type { CompleteFn } from "./llmJudge";
import { stripFences } from "./deterministic";

/**
 * Agentic judge (DESIGN §8). A judge that can call tools in a ReAct loop before
 * committing to a verdict, capturing each tool-call step for the drill-down.
 * It's provider-agnostic: rather than depend on each vendor's native tool-call
 * API, it drives a text protocol over the same `complete` fn the LLM-judge uses,
 * so it runs anywhere a completion does (real key or sample mock).
 *
 * Protocol — the judge replies with exactly one of:
 *   ACTION: <tool>\nINPUT: <text>
 *   FINAL: {"score": <0..1>, "reasoning": "<one sentence>"}
 */

const DEFAULT_MAX_STEPS = 4;

/** Tools the judge may call, each operating on the output under review. */
function makeTools(output: ModelOutput): Record<string, (input: string) => string> {
  return {
    word_count: () => String(output.text.trim().split(/\s+/).filter(Boolean).length),
    regex_test: (input) => {
      try {
        return new RegExp(input.trim()).test(output.text) ? "true" : "false";
      } catch {
        return "invalid regex";
      }
    },
    calc: (input) => {
      const expr = input.trim();
      if (!/^[0-9+\-*/(). ]+$/.test(expr)) return "unsupported expression";
      try {
        // Guarded: only arithmetic characters reach the evaluator (harness-only).
        const value = Function(`"use strict"; return (${expr});`)() as unknown;
        return typeof value === "number" && Number.isFinite(value)
          ? String(value)
          : "not a number";
      } catch {
        return "eval error";
      }
    },
  };
}

const TOOL_DOCS =
  "TOOLS:\n" +
  "- word_count — INPUT ignored; returns the word count of the output under review.\n" +
  "- regex_test — INPUT is a regex; returns true/false for whether the output matches.\n" +
  "- calc — INPUT is an arithmetic expression; returns its numeric value.";

const SYSTEM =
  "You are an agentic evaluation judge. You may call tools to gather evidence " +
  "before scoring. Reply with EXACTLY ONE of:\n" +
  "ACTION: <tool>\nINPUT: <text>\n" +
  'or\nFINAL: {"score": <number 0..1>, "reasoning": "<one sentence>"}\n' +
  "Use at most a few tool calls, then finalize.";

type ParsedReply =
  | { type: "action"; tool: string; input: string }
  | { type: "final"; score: number; reasoning: string }
  | { type: "unknown" };

export function parseAgentReply(raw: string): ParsedReply {
  const text = raw.trim();
  const finalIdx = text.search(/FINAL\s*:/i);
  if (finalIdx !== -1) {
    const after = stripFences(text.slice(finalIdx).replace(/FINAL\s*:/i, "")).trim();
    try {
      const obj = JSON.parse(after) as { score?: unknown; reasoning?: unknown };
      return {
        type: "final",
        score: clamp01(Number(obj.score)),
        reasoning:
          typeof obj.reasoning === "string" && obj.reasoning.trim()
            ? obj.reasoning.trim()
            : "(no reasoning)",
      };
    } catch {
      const m = after.match(/0?\.\d+|[01](?:\.0+)?/);
      return { type: "final", score: m ? clamp01(Number(m[0])) : 0, reasoning: after.slice(0, 160) };
    }
  }
  const actionMatch = text.match(/ACTION\s*:\s*([a-z_]+)/i);
  if (actionMatch) {
    const inputMatch = text.match(/INPUT\s*:\s*([\s\S]*)/i);
    return {
      type: "action",
      tool: actionMatch[1]!.toLowerCase(),
      input: (inputMatch?.[1] ?? "").trim(),
    };
  }
  return { type: "unknown" };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function createAgenticJudge(complete: CompleteFn): TypedGrader<"agentic_judge"> {
  return {
    kind: "agentic_judge",
    deterministic: false,
    async grade(output: ModelOutput, config): Promise<GraderResult> {
      const tools = makeTools(output);
      const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
      const judgeModel = config.judgeModel ?? "claude-sonnet-5";
      const steps: AgentStep[] = [];

      const messages: { role: "user" | "assistant" | "system"; content: string }[] = [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `RUBRIC:\n${config.rubric}\n\nOUTPUT UNDER REVIEW:\n${output.text}\n\n${TOOL_DOCS}\n\nBegin.`,
        },
      ];

      for (let step = 0; step < maxSteps; step++) {
        const { text } = await complete({ model: judgeModel, messages });
        const parsed = parseAgentReply(text);

        if (parsed.type === "final") {
          return {
            kind: "agentic_judge",
            score: parsed.score,
            reasoning: parsed.reasoning,
            steps,
            rubric: config.rubric,
          };
        }

        if (parsed.type === "action" && tools[parsed.tool]) {
          const observation = tools[parsed.tool]!(parsed.input);
          steps.push({ tool: parsed.tool, input: parsed.input, observation });
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: `OBSERVATION: ${observation}\nContinue: call another tool or FINAL.`,
          });
          continue;
        }

        // Unknown/invalid reply — nudge once, then bail on the next miss.
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: "Reply with ACTION/INPUT or FINAL as instructed.",
        });
      }

      // Ran out of steps without finalizing — fail closed but keep the trace.
      return {
        kind: "agentic_judge",
        score: 0,
        reasoning: `no verdict within ${maxSteps} steps`,
        steps,
        rubric: config.rubric,
      };
    },
  };
}
