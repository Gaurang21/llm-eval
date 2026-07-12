# LLM Eval Playground — Design Document

> A stateless, bring-your-own-key tool for comparing and scoring LLM outputs.
> Portfolio-grade v1. No database, no auth, no persistence service.

---

## 1. What this is

An LLM eval playground has two halves, and the impressive version ships both:

1. **Interactive playground** — one prompt, several models answering side-by-side, each streaming token-by-token, with latency / tokens / cost shown per pane. The "vibe check" surface.
2. **Eval harness + leaderboard** — a dataset of test cases run against each model, scored by graders (deterministic + LLM-as-judge), aggregated into pass rates and a leaderboard tracked over time.

The leaderboard half is the senior signal: anyone can call an API; few people build the graders and the harness around it. Mechanically the project exercises the whole 2026 demand-skill set at once — concurrent SSE streaming, App Router route handlers, an RSC leaderboard, a type-driven grader system, and an optional agentic grading loop.

---

## 2. Goals & non-goals

### v1 goals
- A stranger lands on the portfolio site, clicks into the app, and it **just works** — no signup, no key required to see something real.
- Live model comparison with **per-pane token streaming** and per-pane metrics.
- A **pre-seeded leaderboard** from real eval runs, loading instantly.
- Adding a provider or a grader is **one new file, zero core changes**.
- **Keys never touch server storage** and are never logged.
- Deploys to Vercel with `git push` — no infra to provision.

### Non-goals (explicitly out of scope for v1 — do not build)
- No auth / user accounts / per-user saved data.
- No database or KV store. No runtime-writable leaderboard.
- No server-held API keys, no spend metering (BYOK removes the need).
- No queue/worker for large eval runs (the harness runs locally, see §4).
- Agentic grader, embedding-similarity grader: **specced, deferred** to a later phase.

---

## 3. Key architectural decisions (the *why*)

These are settled. The rationale is recorded so the implementation doesn't re-litigate them.

### 3.1 Bring-your-own-key (BYOK), stateless
The visitor supplies their own provider API key. It lives in browser session state, is sent per request via an HTTP header, is used for exactly that one call, and is **never persisted or logged** anywhere server-side. This eliminates the entire cost/abuse/secrets surface: there is nothing to meter, nothing to leak, nothing to protect. "Keys live in the session and stream through a normalizing proxy that never stores them" is a stronger security story than most live demos can tell.

### 3.2 The route handler is a normalizing pass-through proxy
Why proxy at all instead of calling providers straight from the browser? Two reasons: (a) some providers block direct browser calls (CORS / no browser-mode SDK), and (b) the proxy is where each vendor's SSE shape is normalized into our single `StreamFrame` format. The key rides through the proxy; the proxy's job is **normalization, not secrecy**.

### 3.3 Static-JSON leaderboard, seeded from local runs
The leaderboard is durable shared state — runs done yesterday still show today. But it does **not** need to update at runtime. So it's seeded by running the harness locally, writing aggregates to `data/leaderboard.json`, and committing that file. The leaderboard page is an RSC that imports the file: instant load, zero runtime cost, real data, no database. Refreshing it means re-running locally and committing again. (This is a legitimate pattern, not a shortcut — many public benchmark sites are exactly this.)

### 3.4 The degradation ladder (no dead ends)
`real key → stub`. Before a visitor enters a key, the playground still animates by streaming from a **stub provider** — but every stubbed pane is clearly labeled `SAMPLE` and captioned as illustrative. Entering a key swaps stub → real. Nothing unlabeled is ever synthetic: for a tool about honest measurement, being honest about *when you're not measuring* is a product-judgment signal, not a footnote.

### 3.5 No-key empty state = labeled sample, one click
The empty state offers "▶ Watch a sample comparison" (runs the labeled stub) next to "Enter your key to run live." A recruiter clicking through in 20 seconds sees the streaming UI animate without pasting a key; anyone entering a key gets the real thing with the `SAMPLE` badge gone. Honest, low-friction, and it still rewards entering a key.

---

## 4. Architecture

```
Next.js App Router + TypeScript on Vercel — stateless, no persistence service
│
├─ app/
│  ├─ (playground)/page.tsx     client — multi-pane streaming compare
│  ├─ leaderboard/page.tsx      RSC — imports data/leaderboard.json
│  └─ api/generate/route.ts     SSE proxy — BYOK pass-through, normalizes to StreamFrame
│
├─ lib/
│  ├─ providers/
│  │  ├─ registry.ts            id → Provider lookup + metadata
│  │  ├─ anthropic.ts           anti-corruption layer (vendor SSE → delta)
│  │  ├─ openai.ts
│  │  └─ stub.ts                canned deltas; the degradation floor
│  ├─ graders/
│  │  ├─ types.ts               GraderResult union + generic Grader<C>
│  │  ├─ deterministic.ts       exact / regex / json_schema / latency / cost
│  │  ├─ llmJudge.ts            single-shot LLM-as-judge (structured JSON)
│  │  └─ registry.ts            kind → Grader lookup
│  ├─ eval/runEval.ts           the harness — RUN LOCALLY to seed the leaderboard
│  └─ pricing.ts                per-model token pricing (for the cost column)
│
├─ data/leaderboard.json        committed, seeded from local eval runs
│
├─ hooks/
│  ├─ useModelStream.ts         concurrent fan-out + manual SSE parse
│  └─ useApiKeys.ts             session-only key state, per provider
│
└─ components/
   ├─ ApiKeySettings.tsx        in-app AI settings UI — paste keys here
   ├─ ComparePane.tsx           one model's streaming output + metrics + SAMPLE badge
   ├─ PromptBar.tsx             prompt input + model multi-select + Run
   └─ leaderboard/              RSC table + a small client filter island
```

### Data flows
**Playground (live, ephemeral):** client fans out N parallel `fetch` calls to `/api/generate`, one per selected model; each returns an SSE `ReadableStream`; deltas are appended into per-model panes. One model erroring must not affect the others.

**Eval (local, seeds the leaderboard):** `npm run eval` runs the harness over cases × models through the *same* provider layer, runs each output's graders, aggregates, and writes `data/leaderboard.json`. `app/api/eval` is intentionally **not deployed** — since the leaderboard is seeded offline, the harness is a script/dev tool, which shrinks the live surface to a single route handler.

---

## 5. Core contracts

These interfaces are load-bearing. Pin them first; the rest is fill-in.

### 5.1 Provider
Unified streaming + non-streaming plus metadata. Each per-provider file is the anti-corruption layer normalizing that vendor's SSE into our delta shape.

```ts
interface Provider {
  id: string;
  stream(req: GenRequest): AsyncGenerator<{ delta: string }>;      // playground + agentic
  complete(req: GenRequest): Promise<{ text: string; usage: Usage }>; // llm-judge
  meta: { contextWindow: number; pricing: PricePerMTok };
}

interface GenRequest {
  model: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  apiKey?: string;        // BYOK — passed through, never stored
  signal?: AbortSignal;   // abort when the pane/panel closes
}
```

### 5.2 StreamFrame (single source of truth for the wire format)
One discriminated union, imported by **both** server and client. This is the contract tying playground and eval streaming together — and the TypeScript-depth showcase.

```ts
type StreamFrame =
  | { type: "delta";     modelId: string; text: string }
  | { type: "cell_done"; modelId: string; caseId: string; results: GraderResult[] }
  | { type: "done";      modelId: string; latencyMs: number; tokens: number; costUsd: number }
  | { type: "error";     modelId: string; message: string };
```

Client and server handle it **exhaustively** with a `never` guard so adding a frame kind is a compile error until every site handles it.

### 5.3 Grader (generic + discriminated union)
```ts
type GraderResult =
  | { kind: "exact_match"; passed: boolean; expected: string; got: string }
  | { kind: "regex";       passed: boolean; pattern: string }
  | { kind: "json_schema"; passed: boolean; errors: string[] }
  | { kind: "latency";     passed: boolean; latencyMs: number; thresholdMs: number }
  | { kind: "llm_judge";   score: number; reasoning: string; rubric: string };

interface Grader<C = unknown> {
  kind: GraderResult["kind"];
  deterministic: boolean;   // cheap/free graders run first; short-circuit before the LLM-judge
  grade(output: ModelOutput, config: C): Promise<GraderResult>;
}
```

The `deterministic` flag drives ordering: run the free local checks first, only spend on the LLM-judge if the case still needs it.

### 5.4 API keys (client-only)
```ts
type ApiKeys = Partial<Record<ProviderId, string>>;
// held in React state; MAY mirror to sessionStorage so a refresh doesn't wipe it.
// NEVER localStorage (persists across sessions). Sent per-request via header, never to the body.
```

Request shape — key in a header, not the body (keeps it out of any accidental body logging):
```ts
fetch("/api/generate", {
  method: "POST",
  headers: { "x-provider-key": keys[providerId] ?? "" }, // empty → route uses stub
  body: JSON.stringify({ model, messages }),
});
```

Proxy route — the whole degradation story in one line:
```ts
const key = req.headers.get("x-provider-key");
const provider = key ? getProvider(model) : stubProvider;  // no key → stub, no dead end
// never log `key`; never persist it.
```

---

## 6. Component & design system

Direction: **cutting-edge but accessible by construction.** The stack below gets modern aesthetics *and* correct keyboard/ARIA behavior without hand-rolling either.

### 6.1 Foundation — shadcn/ui on Base UI primitives
- **shadcn/ui** is the 2026 default for new Next.js projects: you copy component source into your repo (you own it, no dependency lock-in), it's Tailwind-styled with zero runtime CSS cost, and it plays well with React Server Components. It also ships AI-agent tooling (CLI, `llms.txt`, skills, an MCP server), which matters because this project is being built by a coding agent.
- **Primitive layer: prefer Base UI over Radix.** shadcn/ui historically wraps Radix primitives, but Radix's maintenance slowed after its acquisition, and shadcn added **Base UI** (from the Radix/MUI lineage, full-time maintained, better React 19 / RSC types) as an alternative primitive foundation in late 2025. For a fresh 2026 build, configure shadcn to use **Base UI** primitives. Either way the accessibility (focus trapping, keyboard nav, ARIA roles) comes from the primitive layer, not from us.

### 6.2 Accessibility escape hatch — React Aria
For any custom widget shadcn doesn't cover cleanly — most likely the **eval-run matrix** (cases × models grid) or the model multi-select combobox — reach for **React Aria** (Adobe). It's the deepest, most thoroughly tested a11y primitive set (keyboard, screen-reader, focus, i18n) and is the right tool when a bespoke interactive surface needs guaranteed correctness.

### 6.3 "Wow" layer — used with restraint
The streaming panes are the natural hero: text materializing token-by-token is inherently kinetic, so **let the streaming itself be the signature moment** rather than piling on effects. If extra polish is wanted (e.g., an animated leaderboard reveal), an animation-first kit built on the same shadcn/Tailwind foundation (Magic UI / Aceternity-class) can supply it — but **spend boldness in one place** and keep everything else quiet. Over-animation is a tell that a UI was generated rather than designed.

### 6.4 Design tokens (starting direction — adjustable)
Propose one deliberate identity rather than defaults. A starting point that suits a measurement/eval tool: a **calm, instrument-panel** feel — a near-neutral dark surface, a single restrained accent reserved for "live/streaming" state, and a monospace face for output + metrics so numbers align and streamed text reads like a terminal. Concretely:

- **Type:** a characterful display/sans for headings + UI (e.g. a grotesk), a monospace for streamed output and all metric/number columns. Two roles, used consistently.
- **Color:** 4–6 named tokens — surface, raised surface, text, muted text, one accent for active-stream/pass state, one for error/fail. Avoid the generic cream-serif-terracotta and near-black-acid-green AI-default looks.
- **Structure:** the compare panes are a responsive grid; metrics sit in a fixed footer row per pane so they don't jump as text streams in.

(This is a hint, not a mandate — the build step should produce a proper token pass. The one firm rule: derive every color/type choice from a stated token system, don't sprinkle ad-hoc values.)

---

## 7. Accessibility requirements (must-haves)

Accessibility is a quality floor, not a feature. All of these are v1 requirements.

### 7.1 Streaming output (the subtle, important one)
Token-by-token updates will **spam a screen reader** if naively announced. Rule:
- The streaming text container is **not** an assertive live region. Wrap streamed output so tokens render visually without a per-token announcement.
- Announce **state transitions**, not deltas: use a single `aria-live="polite"` **status region** per pane that announces "streaming…", then "done — 1,240 tokens, 820 ms", or "error: …". Screen-reader users get meaningful checkpoints, not a token firehose.
- This nuance is specific to streaming LLM UIs and is worth being able to explain in an interview — it's a real differentiator.

### 7.2 The rest of the floor
- **Visible keyboard focus** on every interactive element; never remove focus rings, style them.
- **Full keyboard operability:** prompt entry, model selection, Run, opening/closing panes and the key-settings dialog — all reachable and operable without a mouse. (Primitive layer handles most of this; verify the custom matrix/combobox.)
- **`prefers-reduced-motion` respected:** if honored, drop non-essential animation. The streamed text should still appear (reduced motion ≠ no content) but without embellishment.
- **Labels:** every API-key input, model selector, and the Run control has an associated accessible label. Key inputs use `type="password"` and `autocomplete="off"`.
- **Contrast:** meet WCAG AA (4.5:1 text, 3:1 large text / UI) for all tokens including the metric badges and pass/fail colors — don't encode pass/fail by color alone; pair with text or an icon.
- **Status, not just color, for grader results:** the `ResultBadge` shows the value/label, not merely a red/green dot.
- **Responsive to mobile:** panes stack vertically on narrow viewports.

---

## 8. Build phases

Each phase is independently demoable; ordering front-loads the streaming + TS-depth pieces that carry the interview narrative.

1. **Provider layer** — registry + `anthropic` + `openai` + `stub`, and the `/api/generate` SSE proxy. Deliver stub-first so it streams with no keys.
2. **Keys UI** — `useApiKeys` + `ApiKeySettings` (session-only, header-passed).
3. **Playground** — `useModelStream` fan-out hook + `ComparePane` grid + `PromptBar`; wire the labeled-sample empty state.
4. **Grader system** — `types.ts`, deterministic graders, registry, exhaustive `ResultBadge`.
5. **LLM-judge grader** — single-shot structured-JSON judge (defensive parse: strip fences, then `JSON.parse`).
6. **Harness** — `lib/eval/runEval.ts` + `npm run eval` script → writes `data/leaderboard.json`. Seed it with a real suite.
7. **Leaderboard** — RSC reading the JSON + a small client filter island + drill-down.
8. **(Optional, later)** agentic grader (judge with tools + streamed tool-call steps); embedding-similarity grader; auth.

Deliver each phase in small reviewable commits. Where a coding agent is doing the work, hand it one phase at a time against this document.

---

## 9. Development & deployment workflow

- **`main` is the deployment branch.** Vercel auto-deploys every push to `main`, so `main` is always what's live on the portfolio site.
- **Push directly to `main`.** This is a solo portfolio repo — no PR/review flow. Commit in small, self-contained units and push straight to `main`.
- **Every commit must be green before it's pushed.** Because a push goes straight to production, a broken commit = a broken live site. Run typecheck + build locally first:
  ```bash
  npm run typecheck && npm run build
  ```
  Only push if both pass. A phase that doesn't compile does not get pushed.
- **Keep each commit runnable.** The build order in §8 is designed so every phase leaves the app in a working, deployable state (stub-first means it streams with zero keys from phase 1). Don't push a half-wired phase that breaks the running app.
- **Optional safety buffer:** Vercel builds preview deployments for any non-`main` branch. Not required for this workflow, but available if a larger change warrants staging before it goes live.

---

## 10. Cost/pricing caveat

`costUsd` depends on per-model token pricing, which changes. Keep pricing in `lib/pricing.ts` as config and verify current rates before seeding the leaderboard — don't hardcode inline, or the cost column drifts silently.

---

## 11. One-line summary (for the portfolio / interview)

> A stateless BYOK LLM-eval playground: provider keys live in the session and stream through a normalizing SSE proxy that never stores them; N models fan out and stream token-by-token into a compare grid; a typed grader system (discriminated unions + a generic `Grader<C>`, exhaustively handled) scores outputs; and a build-time-seeded leaderboard renders as a React Server Component, so the persistent artifact needs no backend at all.
