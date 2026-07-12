/**
 * Token estimation. Vendor streaming responses don't uniformly surface usage
 * mid-stream, so for the live playground metrics we approximate from character
 * count (~4 chars/token). The offline harness can use exact usage from
 * `complete()`; this keeps the streaming path provider-agnostic.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
