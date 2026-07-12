/** Shared numeric formatting for metric columns (monospace, aligned). */

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

export function fmtPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
