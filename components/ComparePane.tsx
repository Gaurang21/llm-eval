"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import type { PaneState } from "@/hooks/useModelStream";
import { getModel, PROVIDER_LABELS } from "@/lib/providers/registry";
import { fmtInt, fmtMs, fmtCost } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One model's streaming output + metrics (DESIGN §4, §7.1).
 *
 * A11y note — the streaming text container is NOT an assertive live region;
 * announcing every token would spam a screen reader. Instead a single
 * aria-live="polite" status region per pane announces STATE TRANSITIONS only:
 * "streaming…" → "done — N tokens, N ms" → "error: …".
 */
export function ComparePane({
  pane,
  onClose,
}: {
  pane: PaneState;
  onClose?: () => void;
}) {
  const model = getModel(pane.modelId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the streaming frontier in view without stealing focus.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pane.status === "streaming") el.scrollTop = el.scrollHeight;
  }, [pane.text, pane.status]);

  return (
    <section
      className="flex min-h-[20rem] flex-col overflow-hidden rounded-xl border border-border bg-raised"
      aria-label={`${model?.label ?? pane.modelId} output`}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={pane.status} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {model?.label ?? pane.modelId}
            </p>
            <p className="truncate text-xs text-faint">
              {model ? PROVIDER_LABELS[model.provider] : "unknown"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pane.isSample && (
            <Badge variant="sample" title="Illustrative stub output — enter a key to run live">
              SAMPLE
            </Badge>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label={`Close ${model?.label ?? pane.modelId} pane`}
              className="rounded-md p-1 text-faint hover:bg-raised-2 hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </header>

      {/* Streaming body — visually updating, but NOT announced per token. */}
      <div
        ref={scrollRef}
        className="scroll-thin flex-1 overflow-y-auto px-4 py-3"
      >
        {pane.status === "error" ? (
          <p className="flex items-start gap-2 font-mono text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{pane.error ?? "Something went wrong."}</span>
          </p>
        ) : (
          <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text">
            {pane.text}
            {pane.status === "streaming" && (
              <span className="stream-caret" aria-hidden />
            )}
            {pane.status === "streaming" && pane.text === "" && (
              <span className="text-faint">thinking…</span>
            )}
          </p>
        )}
      </div>

      {/* Fixed metric footer — doesn't jump as text streams in. */}
      <footer className="grid grid-cols-3 gap-px border-t border-border bg-border text-center">
        <Metric label="latency" value={pane.latencyMs != null ? fmtMs(pane.latencyMs) : "—"} />
        <Metric label="tokens" value={pane.tokens != null ? fmtInt(pane.tokens) : "—"} />
        <Metric label="cost" value={pane.costUsd != null ? fmtCost(pane.costUsd) : "—"} />
      </footer>

      {/* The one polite status region: transitions only, never token deltas. */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage(pane)}
      </div>
    </section>
  );
}

function statusMessage(pane: PaneState): string {
  switch (pane.status) {
    case "streaming":
      return "streaming…";
    case "done":
      return `done — ${fmtInt(pane.tokens ?? 0)} tokens, ${fmtMs(pane.latencyMs ?? 0)}`;
    case "error":
      return `error: ${pane.error ?? "failed"}`;
    case "idle":
      return "";
  }
}

function StatusDot({ status }: { status: PaneState["status"] }) {
  const cls =
    status === "streaming"
      ? "bg-accent live-dot"
      : status === "done"
        ? "bg-accent"
        : status === "error"
          ? "bg-danger"
          : "bg-faint";
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", cls)}
      aria-hidden
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raised px-2 py-2">
      <p className="font-mono text-sm tabular-nums text-text">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
    </div>
  );
}
