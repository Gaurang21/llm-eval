import type { GenRequest, Provider, Usage } from "../types";
import { priceFor } from "../pricing";
import { readSSE, readErrorMessage } from "./sse";

/**
 * OpenAI anti-corruption layer: normalizes the Chat Completions SSE shape into
 * our `{ delta }` stream and `{ text, usage }` completion. BYOK key is used for
 * exactly one call and never stored or logged (DESIGN §3.1).
 */

const API_URL = "https://api.openai.com/v1/chat/completions";

function toOpenAIBody(req: GenRequest, stream: boolean) {
  return {
    model: req.model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

export const openaiProvider: Provider = {
  id: "openai",
  meta: { contextWindow: 128_000, pricing: priceFor("gpt-4o") },

  async *stream(req: GenRequest): AsyncGenerator<{ delta: string }> {
    if (!req.apiKey) throw new Error("Missing OpenAI API key");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: headers(req.apiKey),
      body: JSON.stringify(toOpenAIBody(req, true)),
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
        choices?: { delta?: { content?: string } }[];
      };
      const delta = e.choices?.[0]?.delta?.content;
      if (delta) yield { delta };
    }
  },

  async complete(req: GenRequest): Promise<{ text: string; usage: Usage }> {
    if (!req.apiKey) throw new Error("Missing OpenAI API key");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: headers(req.apiKey),
      body: JSON.stringify(toOpenAIBody(req, false)),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  },
};
