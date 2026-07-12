"use client";

import { useId } from "react";
import { Play, Square, Sparkles } from "lucide-react";
import { MODELS, PROVIDER_LABELS } from "@/lib/providers/registry";
import type { ApiKeys } from "@/hooks/useApiKeys";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Prompt input + model multi-select + Run (DESIGN §4). Models are selected with
 * accessible toggle chips (aria-pressed) — full keyboard operability without a
 * bespoke combobox. Chips whose provider has no key are marked as sample.
 */
export function PromptBar({
  prompt,
  onPromptChange,
  selected,
  onToggleModel,
  keys,
  running,
  onRun,
  onStop,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  selected: string[];
  onToggleModel: (id: string) => void;
  keys: ApiKeys;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const promptId = useId();
  const canRun = prompt.trim().length > 0 && selected.length > 0 && !running;
  const anySample = selected.some((id) => {
    const m = MODELS.find((x) => x.id === id);
    return m ? !keys[m.provider]?.trim() : true;
  });

  return (
    <div className="rounded-xl border border-border bg-raised p-4">
      <label htmlFor={promptId} className="mb-2 block text-sm font-medium text-text">
        Prompt
      </label>
      <textarea
        id={promptId}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) onRun();
        }}
        rows={3}
        placeholder="Ask all selected models the same thing…  (⌘/Ctrl+Enter to run)"
        className={cn(
          "w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5",
          "font-mono text-sm text-text placeholder:text-faint focus-visible:border-accent",
        )}
      />

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-text">Models</legend>
        <div className="flex flex-wrap gap-2">
          {MODELS.map((m) => {
            const isSelected = selected.includes(m.id);
            const hasKey = Boolean(keys[m.provider]?.trim());
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleModel(m.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  isSelected
                    ? "border-accent/50 bg-accent/10 text-text"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isSelected ? "bg-accent" : "bg-faint",
                  )}
                  aria-hidden
                />
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-faint">
                  {PROVIDER_LABELS[m.provider]}
                </span>
                {!hasKey && (
                  <span
                    className="text-[10px] font-medium uppercase tracking-wide text-warn"
                    title="No key for this provider — runs as SAMPLE"
                  >
                    sample
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {selected.length === 0
            ? "Select at least one model."
            : `${selected.length} model${selected.length > 1 ? "s" : ""} selected`}
        </p>
        {running ? (
          <Button variant="danger" onClick={onStop}>
            <Square className="size-4" aria-hidden />
            Stop
          </Button>
        ) : (
          <Button onClick={onRun} disabled={!canRun}>
            {anySample ? (
              <Sparkles className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            Run
          </Button>
        )}
      </div>
    </div>
  );
}
