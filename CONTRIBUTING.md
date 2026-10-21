# Contributing to NyxAPI

NyxAPI is open source (MIT) and looking for contributors. Bug reports, schema edge cases, docs fixes, tests and code are all welcome.

## Set up

Requires Node 22.12+ and pnpm 10.

```bash
pnpm install
pnpm check          # lint, type-check, tests, build, generated-code check
```

Other useful commands: `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm smoke:pack` (pack, install into an empty project, generate, run), `pnpm --filter @nyxapi/website dev` (the documentation site). Backend changes: edit `supabase/migrations/`, then run `supabase/tests/run.sh` (needs a local Postgres) and `node website/scripts/generate-seed.mjs` if the built-in content changed; see `docs/BACKEND.md`.

## Layout

`packages/core` (engine) · `packages/codegen` · `packages/cli` · `packages/react` · `packages/devtools` · `fixtures/openapi` · `examples/` · `tests/` · `benchmarks/` · `docs/` · `website/`

Start with `docs/ARCHITECTURE.md` and `docs/API-DESIGN.md`.

## Ground rules

- Behaviour changes need tests. Type-level guarantees need a `.test-d.ts` case.
- No `any` in public API types.
- Generated output must stay deterministic. `pnpm generate:check` must pass.
- Do not log, and never put headers, bodies or query strings in errors.
- Do not claim something works unless a test or a documented run shows it. Documentation examples are executed by `website/test/examples.test.ts`.
- Benchmarks state their method and caveats. No superiority claims.
- Public API changes update `docs/API-DESIGN.md` and the website docs in the same pull request.

## Pull requests

1. Open an issue first for anything large, so the direction is agreed before you spend time.
2. Keep a pull request to one topic. Explain what changed and why, and how you checked it.
3. Run `pnpm check` before pushing.

## Where help is most useful

See `ROADMAP.md`; the website's Roadmap page lists known limitations and open tasks with their size. Open areas include: real-world schema reports (especially large or unusual documents), Next.js and server components integration, browser test matrices, more framework guides, a request timeline for devtools, mutation and rollback benchmarks, and translations of the docs.

## Security

Please report suspected vulnerabilities privately to the maintainers, not in a public issue.
