import type { Metadata } from "next";
import { Info } from "lucide-react";
import raw from "@/data/leaderboard.json";
import type { LeaderboardData } from "@/lib/eval/schema";
import { SiteHeader } from "@/components/SiteHeader";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";
import { Badge } from "@/components/ui/badge";

/**
 * Leaderboard (DESIGN §3.3, §8 phase 7). A React Server Component that imports
 * the build-time-seeded data/leaderboard.json — instant load, zero runtime
 * cost, no database. Refreshing it means re-running `npm run eval` and
 * committing the file again. Interactivity (filter + drill-down) lives in a
 * small client island.
 */

export const metadata: Metadata = {
  title: "Leaderboard · LLM Eval",
  description:
    "Pass rates, latency, and cost per model from a typed grader suite, seeded from local eval runs.",
};

const data = raw as LeaderboardData;

export default function LeaderboardPage() {
  const generated = new Date(data.generatedAt);
  return (
    <div className="min-h-dvh">
      <SiteHeader active="leaderboard" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Leaderboard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {data.entries.length} models scored on {data.cases.length} cases
              by a typed grader suite — deterministic checks plus an LLM-judge.
              Pass threshold {Math.round(data.passThreshold * 100)}%.
            </p>
          </div>
          <div className="text-right">
            <div className="mb-1">
              {data.source === "sample" ? (
                <Badge variant="sample">SAMPLE DATA</Badge>
              ) : (
                <Badge variant="pass">LIVE RUN</Badge>
              )}
            </div>
            <p className="font-mono text-xs text-faint">
              seeded {generated.toISOString().slice(0, 10)}
            </p>
          </div>
        </div>

        {data.source === "sample" && (
          <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              This board was seeded in <strong className="text-text">sample</strong>{" "}
              mode — the real grader pipeline ran over representative per-model
              answers rather than live API calls. Re-run{" "}
              <code className="font-mono text-text">npm run eval</code> with
              provider keys set to replace it with a live run.
            </span>
          </p>
        )}

        <LeaderboardView data={data} />
      </main>
    </div>
  );
}
