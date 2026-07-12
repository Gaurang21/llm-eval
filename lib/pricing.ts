import type { PricePerMTok } from "./types";

/**
 * Per-model token pricing, USD per million tokens (DESIGN §10).
 * Pricing drifts — keep it here as config and re-verify current rates before
 * seeding the leaderboard. Never hardcode a cost inline anywhere else.
 *
 * Rates below are representative published list prices as of mid-2026 and are
 * the single place to update when they change.
 */
export const PRICING: Record<string, PricePerMTok> = {
  // Anthropic
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const FALLBACK: PricePerMTok = { input: 1, output: 3 };

export function priceFor(modelId: string): PricePerMTok {
  return PRICING[modelId] ?? FALLBACK;
}

/** Compute USD cost from token usage and a per-MTok price. */
export function costUsd(
  usage: { inputTokens: number; outputTokens: number },
  price: PricePerMTok,
): number {
  return (
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.outputTokens / 1_000_000) * price.output
  );
}
