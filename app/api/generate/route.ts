import type { NextRequest } from "next/server";
import type { GenRequest, StreamFrame } from "@/lib/types";
import { getProvider, stubProvider } from "@/lib/providers/registry";
import { estimateTokens } from "@/lib/tokens";
import { priceFor, costUsd } from "@/lib/pricing";

/**
 * The normalizing pass-through proxy (DESIGN §3.2, invariant #2). It reads the
 * BYOK key header, picks real-vs-stub provider, and streams `StreamFrame`s as
 * SSE. It normalizes each vendor's SSE — it does not store state.
 *
 *   const key = req.headers.get("x-provider-key");
 *   const provider = key ? getProvider(model) : stubProvider;  // no dead ends
 *
 * The key is used for exactly one call. It is NEVER logged and NEVER persisted.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeFrame(frame: StreamFrame): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`);
}

export async function POST(req: NextRequest): Promise<Response> {
  // Read the key from the header only (never the body) so it can't be caught by
  // accidental body logging. Do NOT log this value anywhere.
  const key = req.headers.get("x-provider-key")?.trim() || undefined;

  let body: { model?: string; messages?: GenRequest["messages"] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const model = body.model;
  const messages = body.messages;
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing model or messages", { status: 400 });
  }

  // The whole degradation story in one line: no key → labeled stub, no dead end.
  let provider;
  try {
    provider = key ? getProvider(model) : stubProvider;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Unknown model", {
      status: 400,
    });
  }

  const started = Date.now();
  const genReq: GenRequest = {
    model,
    messages,
    apiKey: key,
    signal: req.signal,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: StreamFrame) => controller.enqueue(encodeFrame(frame));
      let acc = "";
      try {
        for await (const { delta } of provider.stream(genReq)) {
          acc += delta;
          send({ type: "delta", modelId: model, text: delta });
        }

        const outputTokens = estimateTokens(acc);
        const inputTokens = estimateTokens(
          messages.map((m) => m.content).join("\n"),
        );
        const cost = costUsd(
          { inputTokens, outputTokens },
          priceFor(model),
        );
        send({
          type: "done",
          modelId: model,
          latencyMs: Date.now() - started,
          tokens: outputTokens,
          costUsd: cost,
        });
      } catch (err) {
        // Aborts are expected when a pane/panel closes — end quietly.
        if (err instanceof DOMException && err.name === "AbortError") {
          controller.close();
          return;
        }
        send({
          type: "error",
          modelId: model,
          message: err instanceof Error ? err.message : "Stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
