"use client";

import { useCallback, useRef, useState } from "react";
import type { StreamFrame } from "@/lib/types";
import { parseFrames } from "@/lib/streamClient";
import { assertNever } from "@/lib/utils";
import type { ApiKeys } from "./useApiKeys";
import { providerForModel } from "@/lib/providers/registry";

/**
 * Concurrent fan-out streaming hook (DESIGN §4). Fires N parallel fetches to
 * /api/generate — one per selected model — and appends deltas into per-model
 * pane state. One model erroring must not affect the others. In-flight streams
 * are aborted via AbortController when a run is cancelled or superseded.
 */

export type PaneStatus = "idle" | "streaming" | "done" | "error";

export interface PaneState {
  modelId: string;
  text: string;
  status: PaneStatus;
  isSample: boolean; // true when streamed from the stub (no key for provider)
  latencyMs?: number;
  tokens?: number;
  costUsd?: number;
  error?: string;
}

export function useModelStream(keys: ApiKeys) {
  const [panes, setPanes] = useState<Record<string, PaneState>>({});
  const [running, setRunning] = useState(false);
  const controllers = useRef<Map<string, AbortController>>(new Map());

  const patch = useCallback((modelId: string, p: Partial<PaneState>) => {
    setPanes((prev) => {
      const cur = prev[modelId];
      if (!cur) return prev;
      return { ...prev, [modelId]: { ...cur, ...p } };
    });
  }, []);

  const streamOne = useCallback(
    async (modelId: string, prompt: string) => {
      const provider = providerForModel(modelId);
      const key = provider ? keys[provider]?.trim() : undefined;
      const controller = new AbortController();
      controllers.current.set(modelId, controller);
      let acc = "";

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-provider-key": key ?? "", // empty → route uses stub
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const msg = await res.text();
          patch(modelId, { status: "error", error: msg || `HTTP ${res.status}` });
          return;
        }

        for await (const frame of parseFrames(res, controller.signal)) {
          switch (frame.type) {
            case "delta":
              acc += frame.text;
              patch(modelId, { text: acc, status: "streaming" });
              break;
            case "done":
              patch(modelId, {
                status: "done",
                latencyMs: frame.latencyMs,
                tokens: frame.tokens,
                costUsd: frame.costUsd,
              });
              break;
            case "error":
              patch(modelId, { status: "error", error: frame.message });
              break;
            case "cell_done":
              // Playground streaming doesn't emit grader cells; the harness does.
              break;
            default:
              assertNever(frame, "StreamFrame");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        patch(modelId, {
          status: "error",
          error: err instanceof Error ? err.message : "Stream failed",
        });
      } finally {
        controllers.current.delete(modelId);
      }
    },
    [keys, patch],
  );

  const run = useCallback(
    async (modelIds: string[], prompt: string) => {
      // Cancel anything in flight, then seed fresh pane state for this run.
      for (const c of controllers.current.values()) c.abort();
      controllers.current.clear();

      const seeded: Record<string, PaneState> = {};
      for (const id of modelIds) {
        const provider = providerForModel(id);
        const isSample = !(provider && keys[provider]?.trim());
        seeded[id] = { modelId: id, text: "", status: "streaming", isSample };
      }
      setPanes(seeded);
      setRunning(true);

      // Fan out — independent; one failure never blocks the others.
      await Promise.allSettled(modelIds.map((id) => streamOne(id, prompt)));
      setRunning(false);
    },
    [keys, streamOne],
  );

  const abortAll = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
    setRunning(false);
    setPanes((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const p = next[id];
        if (p && p.status === "streaming") next[id] = { ...p, status: "idle" };
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
    setRunning(false);
    setPanes({});
  }, []);

  return { panes, running, run, abortAll, reset };
}
