import type { StreamFrame } from "./types";

/**
 * Client-side SSE reader: parses the `/api/generate` response body into typed
 * `StreamFrame`s. This is the "manual SSE parse" half of the wire contract —
 * the server encodes frames as `data: <json>\n\n`, we decode them back.
 */
export async function* parseFrames(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<StreamFrame> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = chunk
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          yield JSON.parse(dataLine.slice(5).trim()) as StreamFrame;
        } catch {
          /* skip malformed frame */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
