"use client";

import { useState } from "react";
import type { StreamFrame } from "@/lib/types";
import { assertNever } from "@/lib/utils";

/**
 * Phase-1 smoke page: proves the stub streams end-to-end through /api/generate
 * with zero keys. Replaced by the full multi-pane compare grid in phase 3.
 */
export default function PlaygroundPage() {
  const [prompt, setPrompt] = useState("Explain what an LLM eval harness is.");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [meta, setMeta] = useState("");

  async function run() {
    setOutput("");
    setMeta("");
    setStatus("streaming");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "x-provider-key": "" }, // empty → stub
      body: JSON.stringify({
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const frame = JSON.parse(line.slice(5).trim()) as StreamFrame;
        switch (frame.type) {
          case "delta":
            setOutput((o) => o + frame.text);
            break;
          case "done":
            setMeta(`${frame.tokens} tokens · ${frame.latencyMs} ms`);
            setStatus("done");
            break;
          case "error":
            setMeta(frame.message);
            setStatus("error");
            break;
          case "cell_done":
            break;
          default:
            assertNever(frame, "StreamFrame");
        }
      }
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">LLM Eval — phase 1 smoke test</h1>
      <textarea
        className="w-full rounded-md border bg-raised p-3 font-mono text-sm"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        aria-label="Prompt"
      />
      <button
        className="mt-3 rounded-md bg-accent px-4 py-2 font-medium text-surface"
        onClick={run}
      >
        Run sample (stub)
      </button>
      <div aria-live="polite" className="mt-2 text-sm text-muted">
        {status === "streaming" ? "streaming…" : meta}
      </div>
      <pre className="mt-4 whitespace-pre-wrap rounded-md border bg-raised p-4 font-mono text-sm">
        {output}
      </pre>
    </main>
  );
}
