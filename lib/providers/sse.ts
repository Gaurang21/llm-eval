/**
 * Minimal SSE line reader shared by the real-provider anti-corruption layers.
 * Reads a fetch Response body and yields the raw string payload of each
 * `data:` field. `[DONE]` sentinels and comment/blank lines are skipped; the
 * caller JSON-parses and normalizes vendor-specific shapes.
 */
export async function* readSSE(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!res.body) throw new Error("No response body to stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; fields we care about are
      // `data:`. Process complete lines, keep the trailing partial in buffer.
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "" || data === "[DONE]") continue;
        yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Read an error response body defensively for a useful message. */
export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json?.error?.message ?? json?.message ?? text.slice(0, 300);
    } catch {
      return text.slice(0, 300) || `HTTP ${res.status}`;
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}
