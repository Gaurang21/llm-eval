"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import type { LeaderboardData, LeaderboardEntry } from "@/lib/eval/schema";
import { PROVIDER_LABELS } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/types";
import { fmtInt, fmtMs, fmtCost, fmtPct } from "@/lib/format";
import { ResultBadge } from "@/components/ResultBadge";
import { cn } from "@/lib/utils";

/**
 * Client filter island + drill-down over the RSC-provided leaderboard data
 * (DESIGN §8 phase 7). Filtering by category recomputes each model's pass rate
 * over just that category's cases and re-ranks. Expanding a row reveals the
 * per-case grader results (rendered by the exhaustive ResultBadge).
 */

type SortKey = "passRate" | "latency" | "cost";

interface ViewRow {
  entry: LeaderboardEntry;
  passed: number;
  total: number;
  passRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
}

export function LeaderboardView({ data }: { data: LeaderboardData }) {
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(data.cases.map((c) => c.category)))],
    [data.cases],
  );
  const [category, setCategory] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("passRate");
  const [expanded, setExpanded] = useState<string | null>(null);

  const caseCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.cases) m.set(c.id, c.category);
    return m;
  }, [data.cases]);

  const rows = useMemo<ViewRow[]>(() => {
    const derived = data.entries.map((entry): ViewRow => {
      const cells =
        category === "all"
          ? entry.cells
          : entry.cells.filter((c) => caseCategory.get(c.caseId) === category);
      const passed = cells.filter((c) => c.passed).length;
      const total = cells.length;
      const totalCost = cells.reduce((n, c) => n + c.costUsd, 0);
      const avgLat = total
        ? cells.reduce((n, c) => n + c.latencyMs, 0) / total
        : 0;
      return {
        entry,
        passed,
        total,
        passRate: total ? passed / total : 0,
        avgLatencyMs: avgLat,
        totalCostUsd: totalCost,
      };
    });
    derived.sort((a, b) => {
      if (sortKey === "passRate")
        return b.passRate - a.passRate || a.avgLatencyMs - b.avgLatencyMs;
      if (sortKey === "latency") return a.avgLatencyMs - b.avgLatencyMs;
      return a.totalCostUsd - b.totalCostUsd;
    });
    return derived;
  }, [data.entries, category, sortKey, caseCategory]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter by category"
          className="flex flex-wrap gap-1 rounded-lg border border-border bg-raised p-1"
        >
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                category === c
                  ? "bg-raised-2 text-text"
                  : "text-muted hover:text-text",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-border bg-raised px-2 py-1.5 text-sm text-text focus-visible:border-accent"
          >
            <option value="passRate">Pass rate</option>
            <option value="latency">Latency</option>
            <option value="cost">Cost</option>
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-raised text-left text-xs uppercase tracking-wider text-faint">
              <th className="w-12 px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Pass rate</th>
              <th className="px-4 py-3 text-right font-medium">Avg latency</th>
              <th className="px-4 py-3 text-right font-medium">Total cost</th>
              <th className="w-10 px-4 py-3" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Row
                key={row.entry.modelId}
                row={row}
                rank={i + 1}
                data={data}
                expanded={expanded === row.entry.modelId}
                onToggle={() =>
                  setExpanded((cur) =>
                    cur === row.entry.modelId ? null : row.entry.modelId,
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  row,
  rank,
  data,
  expanded,
  onToggle,
}: {
  row: ViewRow;
  rank: number;
  data: LeaderboardData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { entry } = row;
  const panelId = `drill-${entry.modelId}`;
  return (
    <>
      <tr className="border-b border-border transition-colors hover:bg-raised/60">
        <td className="px-4 py-3">
          <RankBadge rank={rank} />
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-text">{entry.label}</div>
          <div className="text-xs text-faint">
            {PROVIDER_LABELS[entry.provider as ProviderId] ?? entry.provider}
          </div>
        </td>
        <td className="px-4 py-3">
          <PassRateMeter fraction={row.passRate} passed={row.passed} total={row.total} />
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
          {fmtMs(row.avgLatencyMs)}
        </td>
        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
          {fmtCost(row.totalCostUsd)}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? "Hide" : "Show"} per-case results for ${entry.label}`}
            className="rounded-md p-1 text-muted hover:bg-raised-2 hover:text-text"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr id={panelId}>
          <td colSpan={6} className="bg-surface px-4 py-4">
            <DrillDown entry={entry} data={data} />
          </td>
        </tr>
      )}
    </>
  );
}

function DrillDown({
  entry,
  data,
}: {
  entry: LeaderboardEntry;
  data: LeaderboardData;
}) {
  const caseName = new Map(data.cases.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-2">
      {entry.cells.map((cell) => (
        <div
          key={cell.caseId}
          className="flex flex-col gap-2 rounded-lg border border-border bg-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-xs font-bold",
                cell.passed
                  ? "bg-accent/15 text-accent"
                  : "bg-danger/15 text-danger",
              )}
              aria-hidden
            >
              {cell.passed ? "✓" : "✕"}
            </span>
            <span className="text-sm text-text">
              {caseName.get(cell.caseId) ?? cell.caseId}
            </span>
            <span className="sr-only">{cell.passed ? "passed" : "failed"}</span>
            <span className="font-mono text-xs text-faint">
              {fmtInt(cell.tokens)} tok · {fmtMs(cell.latencyMs)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cell.results.map((r, idx) => (
              <ResultBadge key={idx} result={r} passThreshold={data.passThreshold} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-accent">
        <Trophy className="size-4" aria-hidden />1
      </span>
    );
  }
  return <span className="font-mono text-sm text-muted">{rank}</span>;
}

function PassRateMeter({
  fraction,
  passed,
  total,
}: {
  fraction: number;
  passed: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 w-28 overflow-hidden rounded-full bg-raised-2"
        role="meter"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pass rate"
      >
        <div
          className={cn(
            "h-full rounded-full",
            fraction >= 0.8 ? "bg-accent" : fraction >= 0.5 ? "bg-warn" : "bg-danger",
          )}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums text-text">
        {fmtPct(fraction)}
      </span>
      <span className="font-mono text-xs text-faint">
        {passed}/{total}
      </span>
    </div>
  );
}
