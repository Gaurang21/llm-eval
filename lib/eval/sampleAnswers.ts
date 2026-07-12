/**
 * Sample-mode answer generation. When the harness runs without provider keys it
 * seeds the leaderboard from the stub floor — but rather than grade stub
 * gibberish, it feeds the REAL grading pipeline plausible answers so the
 * deterministic graders + judge actually run and produce believable results.
 * The output is written with `source: "sample"` and the UI labels it as such.
 *
 * Each case has a "good" answer that passes and a "weak" answer that fails; a
 * per-model profile decides how often a model produces the weak one, which is
 * what makes the seeded ranking vary in a believable way. Everything is
 * deterministic (seeded by modelId+caseId) so re-running is stable.
 */

export interface ModelProfile {
  errorRate: number; // chance of the weak answer on a given case
  baseMs: number; // synthetic latency floor
  msPerTok: number; // synthetic per-token latency
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "claude-opus-4-8": { errorRate: 0.05, baseMs: 900, msPerTok: 8 },
  "claude-sonnet-5": { errorRate: 0.1, baseMs: 520, msPerTok: 5 },
  "gpt-4o": { errorRate: 0.16, baseMs: 620, msPerTok: 6 },
  "claude-haiku-4-5-20251001": { errorRate: 0.22, baseMs: 300, msPerTok: 3 },
  "gpt-4o-mini": { errorRate: 0.3, baseMs: 340, msPerTok: 3 },
};

const GOOD: Record<string, string> = {
  "capital-france": "Paris",
  "apollo-year": "1969",
  "arithmetic": "391",
  "extract-person": '{"name": "Maria", "age": 34}',
  "sentiment-json": '{"sentiment": "positive"}',
  "primary-colors": "red, blue, yellow",
  "exact-ok": "OK",
  "bat-and-ball":
    "The ball costs $0.05. If the ball were $0.10 the bat would be $1.10 and the total $1.20, so the ball must be $0.05 and the bat $1.05 — a $1.00 gap that sums to $1.10.",
  "micro-vs-mono":
    "Microservices let teams scale and deploy components independently, but they add network, operational, and data-consistency overhead. A monolith is simpler to build and run, yet harder to scale or evolve piecemeal.",
  "explain-eval":
    "An LLM eval harness is like a standardized test for AI models. You collect a set of questions with known-good answers, run each model through them automatically, and score the responses. It turns 'this feels better' into repeatable numbers you can track over time and compare across models.",
};

const WEAK: Record<string, string> = {
  "capital-france": "The capital of France is Lyon.",
  "apollo-year": "It landed in 1972.",
  "arithmetic": "The answer is 371.",
  "extract-person": '{"person": "Maria"}',
  "sentiment-json": "The sentiment is positive.",
  "primary-colors": "The three primary colors are Red, Blue, and Yellow.",
  "exact-ok": "OK!",
  "bat-and-ball":
    "The ball costs $0.10, since the bat is $1.00 and the ball makes up the rest.",
  "micro-vs-mono":
    "Microservices are simply better than monoliths in every way and everyone should use them.",
  "explain-eval":
    "It leverages a polymorphic grader abstraction over a heterogeneous corpus to compute aggregate pass-rate telemetry across the inference surface.",
};

/** Deterministic [0,1) hash so re-runs are stable. */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface SampleOutcome {
  text: string;
  hit: boolean; // did the model produce the good answer?
  judgeScore: number; // pre-decided score for the mock judge (0..1)
}

export function sampleOutcome(modelId: string, caseId: string): SampleOutcome {
  const profile = MODEL_PROFILES[modelId] ?? { errorRate: 0.2, baseMs: 500, msPerTok: 5 };
  const r = seeded(`${modelId}::${caseId}`);
  const hit = r >= profile.errorRate;
  const text = (hit ? GOOD[caseId] : WEAK[caseId]) ?? "(no sample answer)";
  // Judge score jitter, deterministic, in a believable band per outcome.
  const j = seeded(`judge::${modelId}::${caseId}`);
  const judgeScore = hit ? 0.82 + j * 0.15 : 0.18 + j * 0.27;
  return { text, hit, judgeScore: Math.round(judgeScore * 100) / 100 };
}

export function syntheticLatency(modelId: string, tokens: number, caseId: string): number {
  const profile = MODEL_PROFILES[modelId] ?? { errorRate: 0.2, baseMs: 500, msPerTok: 5 };
  const jitter = seeded(`lat::${modelId}::${caseId}`) * 400;
  return Math.round(profile.baseMs + tokens * profile.msPerTok + jitter);
}
