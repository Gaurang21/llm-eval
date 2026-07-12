import type { GraderResult } from "../types";

/**
 * The shape of data/leaderboard.json — the build-time-seeded artifact the
 * leaderboard RSC imports (DESIGN §3.3). Kept in one place so the harness
 * (writer) and the page (reader) can't drift.
 */

export interface LeaderboardCaseMeta {
  id: string;
  name: string;
  category: string;
  prompt: string;
}

export interface EvalCell {
  caseId: string;
  passed: boolean; // overall pass for this case (all graders passed)
  latencyMs: number;
  tokens: number;
  costUsd: number;
  results: GraderResult[];
}

export interface LeaderboardEntry {
  modelId: string;
  label: string;
  provider: string;
  passRate: number; // 0..1 across all cases
  passedCases: number;
  totalCases: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  categories: Record<string, { passed: number; total: number }>;
  cells: EvalCell[];
}

export interface LeaderboardData {
  generatedAt: string; // ISO timestamp
  source: "live" | "sample"; // "sample" = seeded from the stub provider
  passThreshold: number;
  cases: LeaderboardCaseMeta[];
  entries: LeaderboardEntry[]; // sorted best-first by passRate
}
