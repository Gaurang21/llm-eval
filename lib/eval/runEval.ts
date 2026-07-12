/**
 * The eval harness (DESIGN §4, §8 phase 6). RUN LOCALLY to seed the leaderboard:
 *
 *     npm run eval        # writes data/leaderboard.json
 *
 * It runs every case × every model through the SAME provider layer the
 * playground uses, grades each output with the typed grader system (deterministic
 * first, judge only if still needed), aggregates pass rates + latency + cost, and
 * writes the committed JSON the leaderboard RSC imports. It is intentionally NOT
 * deployed — the live surface stays the single /api/generate route.
 *
 * Modes:
 *  - live   — provider keys in env (ANTHROPIC_API_KEY / OPENAI_API_KEY). Real
 *             calls, real grading, real judge. Per-model: a key is used per call
 *             and never stored.
 *  - sample — no keys. Feeds the real grading pipeline plausible per-model
 *             answers + a mock judge, writing `source: "sample"`. The leaderboard
 *             labels this clearly. Deterministic, so re-runs are stable.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { GenRequest, ModelOutput, Usage } from "../types";
import { MODELS, getProvider } from "../providers/registry";
import { estimateTokens } from "../tokens";
import { priceFor, costUsd } from "../pricing";
import { openaiProvider } from "../providers/openai";
import { gradeOutput, type Deps } from "../graders/registry";
import type { CompleteFn } from "../graders/llmJudge";
import type { EmbedFn } from "../graders/embedding";
import { resultPassed } from "../graders/types";
import { DATASET } from "./dataset";
import { sampleOutcome, syntheticLatency, mockEmbed } from "./sampleAnswers";
import type {
  EvalCell,
  LeaderboardData,
  LeaderboardEntry,
} from "./schema";

const PASS_THRESHOLD = 0.7;

// Load a local .env if present (Node 22 built-in — no dependency) so live mode
// picks up provider keys. Absent file / older runtime → stays in sample mode.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* no .env — sample mode */
}

const ENV_KEYS: Record<string, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};

function keyFor(provider: string): string | undefined {
  const k = ENV_KEYS[provider];
  return k && k.trim() ? k.trim() : undefined;
}

/** A live judge: wraps the real provider's completion for the judge model. */
function liveJudge(): CompleteFn {
  return async (req: GenRequest) => {
    const provider = getProvider(req.model);
    const key = keyFor(provider.id);
    return provider.complete({ ...req, apiKey: key });
  };
}

/** A live embedder: OpenAI embeddings, if that key is present. */
function liveEmbed(): EmbedFn | undefined {
  const key = keyFor("openai");
  if (!key) return undefined;
  return (texts: string[]) => openaiProvider.embed!(texts, key);
}

/**
 * Sample-mode judge that serves BOTH the single-shot LLM-judge and the agentic
 * judge from one pre-decided score. It inspects the system prompt: for the
 * agentic protocol it emits one tool call and then a FINAL verdict (producing a
 * believable step trace); otherwise it returns the plain judge JSON.
 */
function sampleJudge(judgeScore: number): CompleteFn {
  const reasoning =
    judgeScore >= PASS_THRESHOLD
      ? "Meets the rubric: correct and appropriately scoped."
      : "Falls short of the rubric on correctness or scope.";
  const noUsage = { inputTokens: 0, outputTokens: 0 };
  return async (req) => {
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    if (/agentic/i.test(system)) {
      const observed = req.messages.some(
        (m) => m.role === "user" && m.content.startsWith("OBSERVATION:"),
      );
      if (!observed) return { text: "ACTION: word_count\nINPUT: ", usage: noUsage };
      return { text: `FINAL: ${JSON.stringify({ score: judgeScore, reasoning })}`, usage: noUsage };
    }
    return { text: JSON.stringify({ score: judgeScore, reasoning }), usage: noUsage };
  };
}

/** Produce one model's output for one case, plus the deps to grade it with. */
async function produceOutput(
  modelId: string,
  provider: ReturnType<typeof getProvider>,
  live: boolean,
  caseId: string,
  prompt: string,
): Promise<{ output: ModelOutput; deps: Deps }> {
  const started = Date.now();

  if (live) {
    const key = keyFor(provider.id);
    const { text, usage } = await provider.complete({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      apiKey: key,
    });
    const latencyMs = Date.now() - started;
    return {
      output: buildOutput(modelId, caseId, text, usage, latencyMs),
      deps: { judge: liveJudge(), embed: liveEmbed() },
    };
  }

  // Sample mode: plausible answer, real graders, mock judge + mock embedder.
  const { text, judgeScore } = sampleOutcome(modelId, caseId);
  const usage: Usage = {
    inputTokens: estimateTokens(prompt),
    outputTokens: estimateTokens(text),
  };
  const latencyMs = syntheticLatency(modelId, usage.outputTokens, caseId);
  return {
    output: buildOutput(modelId, caseId, text, usage, latencyMs),
    deps: {
      judge: sampleJudge(judgeScore),
      embed: async (texts: string[]) => mockEmbed(texts),
    },
  };
}

function buildOutput(
  modelId: string,
  caseId: string,
  text: string,
  usage: Usage,
  latencyMs: number,
): ModelOutput {
  return {
    modelId,
    caseId,
    text,
    latencyMs,
    tokens: usage.outputTokens,
    costUsd: costUsd(usage, priceFor(modelId)),
  };
}

async function runModel(modelId: string, live: boolean): Promise<LeaderboardEntry> {
  const model = MODELS.find((m) => m.id === modelId)!;
  const provider = getProvider(modelId);
  const cells: EvalCell[] = [];
  const categories: Record<string, { passed: number; total: number }> = {};

  for (const testCase of DATASET) {
    const { output, deps } = await produceOutput(
      modelId,
      provider,
      live,
      testCase.id,
      testCase.prompt,
    );
    const results = await gradeOutput(output, testCase.graders, deps);
    const passed = results.every((r) => resultPassed(r, PASS_THRESHOLD));

    cells.push({
      caseId: testCase.id,
      passed,
      latencyMs: output.latencyMs,
      tokens: output.tokens,
      costUsd: output.costUsd,
      results,
    });

    const cat = (categories[testCase.category] ??= { passed: 0, total: 0 });
    cat.total += 1;
    if (passed) cat.passed += 1;
  }

  const passedCases = cells.filter((c) => c.passed).length;
  const totalCost = cells.reduce((n, c) => n + c.costUsd, 0);

  return {
    modelId,
    label: model.label,
    provider: model.provider,
    passRate: cells.length ? passedCases / cells.length : 0,
    passedCases,
    totalCases: cells.length,
    avgLatencyMs: Math.round(avg(cells.map((c) => c.latencyMs))),
    avgCostUsd: totalCost / Math.max(1, cells.length),
    totalCostUsd: totalCost,
    categories,
    cells,
  };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

async function main() {
  const live = Boolean(keyFor("anthropic") || keyFor("openai"));
  const source: LeaderboardData["source"] = live ? "live" : "sample";
  console.log(`[eval] mode: ${source} (${DATASET.length} cases × ${MODELS.length} models)`);

  const entries: LeaderboardEntry[] = [];
  for (const model of MODELS) {
    // Per model, use real calls only if that provider has a key; else sample it.
    const modelLive = live && Boolean(keyFor(model.provider));
    process.stdout.write(`  · ${model.label} [${modelLive ? "live" : "sample"}] `);
    const entry = await runModel(model.id, modelLive);
    console.log(`${entry.passedCases}/${entry.totalCases} passed`);
    entries.push(entry);
  }

  entries.sort((a, b) => b.passRate - a.passRate || a.avgLatencyMs - b.avgLatencyMs);

  const data: LeaderboardData = {
    generatedAt: new Date().toISOString(),
    source,
    passThreshold: PASS_THRESHOLD,
    cases: DATASET.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      prompt: c.prompt,
    })),
    entries,
  };

  const outPath = path.join(process.cwd(), "data", "leaderboard.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`[eval] wrote ${outPath} (source: ${source})`);
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
