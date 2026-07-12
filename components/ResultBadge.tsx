import { Check, X, Scale, Wrench, Radar } from "lucide-react";
import type { GraderResult } from "@/lib/types";
import { assertNever } from "@/lib/utils";
import { fmtMs, fmtCost, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Renders one GraderResult EXHAUSTIVELY (DESIGN §7.2). Pass/fail is never
 * encoded by color alone: every badge carries an icon + a text value/label, so
 * it's legible to color-blind users and screen readers alike.
 */
export function ResultBadge({
  result,
  passThreshold = 0.7,
}: {
  result: GraderResult;
  passThreshold?: number;
}) {
  const v = describe(result, passThreshold);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs",
        v.tone === "pass" && "border-accent/40 bg-accent/10 text-accent",
        v.tone === "fail" && "border-danger/40 bg-danger/10 text-danger",
        v.tone === "info" && "border-warn/40 bg-warn/10 text-warn",
      )}
      title={v.title}
    >
      {v.icon}
      <span className="font-medium">{v.label}</span>
      <span className="text-text/70">{v.value}</span>
    </span>
  );
}

type Described = {
  tone: "pass" | "fail" | "info";
  icon: React.ReactNode;
  label: string;
  value: string;
  title: string;
};

const PASS = <Check className="size-3.5" aria-hidden />;
const FAIL = <X className="size-3.5" aria-hidden />;
const JUDGE = <Scale className="size-3.5" aria-hidden />;
const AGENT = <Wrench className="size-3.5" aria-hidden />;
const EMBED = <Radar className="size-3.5" aria-hidden />;

function passFail(passed: boolean) {
  return {
    tone: (passed ? "pass" : "fail") as "pass" | "fail",
    icon: passed ? PASS : FAIL,
    word: passed ? "pass" : "fail",
  };
}

function describe(result: GraderResult, passThreshold: number): Described {
  switch (result.kind) {
    case "exact_match": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: s.icon,
        label: "exact",
        value: s.word,
        title: `expected: ${result.expected}\ngot: ${result.got}`,
      };
    }
    case "regex": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: s.icon,
        label: "regex",
        value: s.word,
        title: `pattern: ${result.pattern}`,
      };
    }
    case "json_schema": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: s.icon,
        label: "json",
        value: result.passed ? "valid" : `${result.errors.length} err`,
        title: result.errors.join("\n") || "valid JSON object",
      };
    }
    case "latency": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: s.icon,
        label: "latency",
        value: fmtMs(result.latencyMs),
        title: `threshold: ${fmtMs(result.thresholdMs)}`,
      };
    }
    case "cost": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: s.icon,
        label: "cost",
        value: fmtCost(result.costUsd),
        title: `threshold: ${fmtCost(result.thresholdUsd)}`,
      };
    }
    case "embedding_similarity": {
      const s = passFail(result.passed);
      return {
        tone: s.tone,
        icon: result.passed ? EMBED : FAIL,
        label: "embed",
        value: result.similarity.toFixed(2),
        title: `cosine similarity ${result.similarity.toFixed(3)} vs threshold ${result.threshold}`,
      };
    }
    case "llm_judge": {
      const passed = result.score >= passThreshold;
      return {
        tone: passed ? "pass" : "info",
        icon: passed ? PASS : JUDGE,
        label: "judge",
        value: fmtPct(result.score),
        title: `${result.reasoning}\n\nrubric: ${result.rubric}`,
      };
    }
    case "agentic_judge": {
      const passed = result.score >= passThreshold;
      const trace = result.steps.length
        ? result.steps.map((s) => `${s.tool}(${s.input || "·"}) → ${s.observation}`).join("\n")
        : "no tool calls";
      return {
        tone: passed ? "pass" : "info",
        icon: passed ? PASS : AGENT,
        label: `agent·${result.steps.length}`,
        value: fmtPct(result.score),
        title: `${result.reasoning}\n\nsteps:\n${trace}\n\nrubric: ${result.rubric}`,
      };
    }
    default:
      return assertNever(result, "GraderResult");
  }
}
