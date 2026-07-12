import type { GenRequest, Provider, Usage } from "../types";
import { priceFor } from "../pricing";
import { readSSE, readErrorMessage } from "./sse";

/**
 * Anthropic anti-corruption layer: normalizes the Messages API SSE shape into
 * our `{ delta }` stream and `{ text, usage }` completion. The route handler
 * passes the BYOK key through to `req.apiKey`; it is used for exactly one call
 * and never stored or logged (DESIGN §3.1).
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

/** Split our flat messages into Anthropic's system string + turn list. */
function toAnthropicBody(req: GenRequest, stream: boolean) {
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  return {
    model: req.model,
    max_tokens: MAX_TOKENS,
    ...(system ? { system } : {}),
    messages,
    stream,
  };
}

function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
  };
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  meta: { contextWindow: 200_000, pricing: priceFor("claude-sonnet-5") },

  async *stream(req: GenRequest): AsyncGenerator<{ delta: string }> {
    if (!req.apiKey) throw new Error("Missing Anthropic API key");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: headers(req.apiKey),
      body: JSON.stringify(toAnthropicBody(req, true)),
      signal: req.signal,
    });
    if (!res.ok || !res.body) throw new Error(await readErrorMessage(res));

    for await (const data of readSSE(res, req.signal)) {
      let evt: unknown;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const e = evt as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
        if (e.delta.text) yield { delta: e.delta.text };
      }
    }
  },

  async complete(req: GenRequest): Promise<{ text: string; usage: Usage }> {
    if (!req.apiKey) throw new Error("Missing Anthropic API key");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: headers(req.apiKey),
      body: JSON.stringify(toAnthropicBody(req, false)),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));

    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return {
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    };
  },
};
