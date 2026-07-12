"use client";

import { useMemo, useState } from "react";
import { Play, KeyRound } from "lucide-react";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useModelStream } from "@/hooks/useModelStream";
import { SiteHeader } from "@/components/SiteHeader";
import { ApiKeySettings } from "@/components/ApiKeySettings";
import { PromptBar } from "@/components/PromptBar";
import { ComparePane } from "@/components/ComparePane";
import { Button } from "@/components/ui/button";

const DEFAULT_MODELS = ["claude-sonnet-5", "gpt-4o", "claude-haiku-4-5-20251001"];
const DEFAULT_PROMPT =
  "In two sentences, explain what makes a good LLM eval, then give one concrete example.";

/**
 * The playground (DESIGN §3.5, §4): N models answer the same prompt side-by-side,
 * each streaming token-by-token. Before a key is entered the empty state offers a
 * one-click labeled-sample comparison next to "enter your key to run live".
 */
export default function PlaygroundPage() {
  const { keys, setKey, clearKey, clearAll } = useApiKeys();
  const { panes, running, run, abortAll } = useModelStream(keys);

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODELS);

  const toggleModel = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const paneList = useMemo(
    () => selected.map((id) => panes[id]).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [selected, panes],
  );

  const hasRun = Object.keys(panes).length > 0;

  const runSample = () => {
    setSelected(DEFAULT_MODELS);
    setPrompt(DEFAULT_PROMPT);
    run(DEFAULT_MODELS, DEFAULT_PROMPT);
  };

  return (
    <div className="min-h-dvh">
      <SiteHeader
        active="playground"
        right={
          <ApiKeySettings
            keys={keys}
            onSetKey={setKey}
            onClearKey={clearKey}
            onClearAll={clearAll}
          />
        }
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Compare models, side by side
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One prompt, several models, streaming token-by-token with latency,
            tokens, and cost per pane. Bring your own key — or watch a labeled
            sample first.
          </p>
        </div>

        <PromptBar
          prompt={prompt}
          onPromptChange={setPrompt}
          selected={selected}
          onToggleModel={toggleModel}
          keys={keys}
          running={running}
          onRun={() => run(selected, prompt)}
          onStop={abortAll}
        />

        {hasRun ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paneList.map((pane) => (
              <ComparePane key={pane.modelId} pane={pane} />
            ))}
          </div>
        ) : (
          <EmptyState onRunSample={runSample} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onRunSample }: { onRunSample: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border-strong bg-raised/40 px-6 py-16 text-center">
      <div>
        <p className="text-lg font-medium text-text">Nothing streaming yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          No key required to see it work — every sample pane is clearly labeled{" "}
          <span className="font-mono text-warn">SAMPLE</span>. Enter a key to
          swap the stub for the real model.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onRunSample}>
          <Play className="size-4" aria-hidden />
          Watch a sample comparison
        </Button>
        <span className="text-xs text-faint">or</span>
        <ApiKeyHint />
      </div>
    </div>
  );
}

function ApiKeyHint() {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted">
      <KeyRound className="size-4 text-accent" aria-hidden />
      Enter your key (top right) to run live
    </span>
  );
}
