import type { GenRequest, Provider, Usage } from "../types";
import { priceFor } from "../pricing";

/**
 * Stub provider — the degradation floor (DESIGN §3.4). When no key is present
 * the route uses this so the playground still animates. Every pane fed by the
 * stub is labeled `SAMPLE` in the UI; nothing unlabeled is ever synthetic.
 *
 * It emits canned, deterministic deltas derived from the prompt so the sample
 * reads as a plausible answer rather than lorem ipsum, streamed token-by-token
 * with small delays to exercise the real streaming path end-to-end.
 */

const SAMPLE_TEMPLATES = [
  "Here's a concise take: {topic} comes down to a few moving parts. First, the core idea — then the tradeoffs, then a concrete example so it sticks.",
  "Short answer: yes, with caveats. On {topic}, the honest framing is that it depends on constraints. Below I walk through the reasoning step by step.",
  "Let me break {topic} down. 1) What it is. 2) Why it matters. 3) Where it breaks. This is illustrative sample output, not a live model call.",
];

function topicFrom(req: GenRequest): string {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const raw = (lastUser?.content ?? "your prompt").trim();
  const words = raw.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 0 ? words.toLowerCase() : "your prompt";
}

/** Deterministic template pick so a given prompt+model is stable across runs. */
function pickTemplate(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % SAMPLE_TEMPLATES.length;
  return SAMPLE_TEMPLATES[idx]!;
}

function buildSample(req: GenRequest): string {
  const topic = topicFrom(req);
  const body = pickTemplate(req.model + topic).replaceAll("{topic}", topic);
  return `${body}\n\n(This is SAMPLE output from the stub provider — enter an API key to run the real model.)`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** ~4 chars/token approximation, good enough for a sample metric. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

export const stubProvider: Provider = {
  id: "stub",
  meta: { contextWindow: 8192, pricing: priceFor("stub") },

  async *stream(req: GenRequest): AsyncGenerator<{ delta: string }> {
    const text = buildSample(req);
    // Stream in word chunks with a leading "thinking" beat.
    await sleep(180, req.signal);
    const chunks = text.match(/\S+\s*/g) ?? [text];
    for (const chunk of chunks) {
      yield { delta: chunk };
      await sleep(18 + (chunk.length % 5) * 6, req.signal);
    }
  },

  async complete(req: GenRequest): Promise<{ text: string; usage: Usage }> {
    const text = buildSample(req);
    const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      text,
      usage: {
        inputTokens: estimateTokens("x".repeat(promptChars)),
        outputTokens: estimateTokens(text),
      },
    };
  },
};
