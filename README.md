# LLM Eval Playground

A stateless, bring-your-own-key tool for comparing and scoring LLM outputs.
Compare N models side-by-side with token-by-token streaming, score outputs with
a typed grader system, and browse a build-time-seeded leaderboard. No database,
no auth, no persistence service.

See `DESIGN.md` for architecture and `CLAUDE.md` for operating instructions.

## Commands

```bash
npm run dev         # local dev server
npm run typecheck   # tsc --noEmit — must pass before every push
npm run build       # production build — must pass before every push
npm run lint        # eslint
npm run eval        # run the harness locally, writes data/leaderboard.json
```

## How it works

- **BYOK, stateless.** Keys live in browser session state, are sent per request
  via the `x-provider-key` header, used for one call, and never stored or logged.
- **`/api/generate` is a normalizing proxy.** It picks real-vs-stub provider and
  streams a single `StreamFrame` wire contract, handled exhaustively both sides.
- **Degradation ladder, no dead ends.** No key → labeled `SAMPLE` stub stream.
- **Leaderboard is build-time data.** Seeded by `npm run eval`, committed as
  `data/leaderboard.json`, rendered by a React Server Component.
