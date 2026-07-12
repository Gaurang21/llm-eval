# CLAUDE.md

Operating instructions for coding agents working in this repo. `DESIGN.md` is the
source of truth for architecture, contracts, and rationale — read it first. This file
is the short operational layer: how to work, what not to break, and how to ship.

---

## Project

Stateless, bring-your-own-key **LLM eval playground**: compare N models side-by-side
with token-by-token streaming, score outputs with a typed grader system, and show a
build-time-seeded leaderboard. Portfolio-grade v1. No database, no auth, no persistence
service. Full spec in `DESIGN.md`.

## Stack

- Next.js (App Router) + TypeScript, strict mode.
- Tailwind CSS.
- **shadcn/ui components, configured on Base UI primitives** (not Radix — see DESIGN §6).
- **React Aria** only for custom widgets shadcn doesn't cover (eval matrix, combobox).
- Deployed on Vercel. No backend services.

## Commands

```bash
npm run dev         # local dev server
npm run typecheck   # tsc --noEmit — must pass before every push
npm run build       # production build — must pass before every push
npm run lint        # eslint
npm run eval        # run the harness locally, writes data/leaderboard.json (dev-only)
```

---

## Git & deployment workflow

- **`main` is the deployment branch. Vercel auto-deploys every push to `main`.**
- **Push directly to `main`.** Solo repo, no PR flow. Small, self-contained commits.
- **Never push a commit that isn't green.** A push goes straight to production. Before
  every push, run `npm run typecheck && npm run build` and only push if both pass.
- **Every commit stays runnable.** The app is stub-first, so it streams with zero keys
  from phase 1 onward — don't push a half-wired change that breaks the running app.
- Work one build phase at a time (DESIGN §8). Commit per phase (or smaller).

---

## Architecture invariants (do not violate)

1. **BYOK keys are never stored or logged.** Keys live in client session state, are
   sent per-request via the `x-provider-key` header, used for one call, and dropped.
   Never write a key to storage, never log the header or request body server-side.
   Never use `localStorage` for keys (`sessionStorage` at most).
2. **The route handler is a normalizing proxy.** `app/api/generate/route.ts` reads the
   key header, picks real-vs-stub provider (`key ? getProvider(model) : stubProvider`),
   and streams `StreamFrame`s. It normalizes each vendor's SSE — it does not store state.
3. **`StreamFrame` is the single wire contract.** One discriminated union, imported by
   both server and client. Handle it **exhaustively** with a `never` guard so adding a
   frame kind is a compile error until every site handles it.
4. **One file per provider, one file per grader.** Adding a provider or grader is a new
   file + a registry entry — zero changes to core/harness/route code. Preserve this.
5. **Graders are typed.** `GraderResult` discriminated union + generic `Grader<C>`.
   `deterministic: true` graders run first and can short-circuit before the LLM-judge.
6. **The leaderboard is build-time data.** It's seeded by running `npm run eval` locally
   and committing `data/leaderboard.json`. The leaderboard page is an RSC that imports
   that file. Do **not** add a runtime write path or a database for it.
7. **`app/api/eval` is not deployed.** The harness is a local script/dev tool. Keep the
   live surface to the single `/api/generate` route.
8. **The degradation ladder has no dead ends:** real key → stub. No key = labeled
   `SAMPLE` stub stream, never silent fake output.

## Code conventions

- TypeScript strict; no `any` — model with unions, generics, `unknown` + narrowing.
- Discriminated unions handled exhaustively (`const _x: never = v`) at every switch.
- Abort in-flight streams with `AbortController` when a pane/panel closes.
- LLM-judge parses defensively: strip ```` ```json ```` fences, then `JSON.parse`.
- Keep per-model token pricing in `lib/pricing.ts` config — never hardcode inline.
- Follow the file tree in DESIGN §4; don't invent a different structure.

## Accessibility (v1 requirements, not optional)

- **Streaming ≠ assertive live region.** Do not announce every token. Put streamed text
  in a normal container, and announce **state transitions only** via one
  `aria-live="polite"` status region per pane ("streaming…" → "done — N tokens, N ms" →
  "error: …"). This is the one a11y detail most streaming UIs get wrong — get it right.
- Visible, styled keyboard focus on everything. Never remove focus rings.
- Full keyboard operability: prompt, model select, Run, panes, key dialog.
- Respect `prefers-reduced-motion` (drop embellishment; content still appears).
- Label every key input (`type="password"`, `autocomplete="off"`), selector, and Run.
- WCAG AA contrast. Never encode pass/fail by color alone — pair with text/icon.
- Panes stack vertically on mobile.

## Do NOT build in v1 (out of scope)

Auth / accounts / per-user data · any database or KV store · runtime-writable
leaderboard · server-held API keys or spend metering · queue/worker for eval runs ·
agentic grader · embedding-similarity grader. These are explicitly deferred — don't
add them "to be helpful."

---

When in doubt, DESIGN.md wins. If a request conflicts with an invariant above, flag it
rather than silently working around it.
