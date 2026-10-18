# Releasing

Nothing has been published to npm yet; the packages are `0.0.x` and the API may change.

## Before any release

```bash
pnpm install --frozen-lockfile
pnpm check            # lint, typecheck, tests, build, generated-code drift
pnpm format:check
pnpm smoke:pack       # the real installability test, see below
```

`scripts/smoke-pack.mjs` packs `core`, `codegen`, `cli` and `react` with `pnpm pack` (which rewrites
`workspace:` ranges), checks the tarballs contain only `dist/`, a README and `package.json`, installs them
into an empty project, runs the installed CLI (`generate`, then `generate --check`), type-checks a strict
NodeNext consumer plus a React component against the generated client, and runs the consumer. It uses the
npm registry for `react`, `typescript` and `@types/*`, so it needs network access. It has been
mutation-checked: breaking the consumer's runtime or type expectations makes it fail.

## Publishing (manual, when you decide to)

1. Pick the version (SemVer; `0.x` allows breaking changes in minors) and set it in every publishable
   `packages/*/package.json` (`core`, `codegen`, `cli`, `react`, `devtools`).
2. Add a CHANGELOG entry at the repository root (not created yet).
3. `pnpm smoke:pack`, then `pnpm -r publish --access public` from a clean checkout of the tagged commit.
   Publishing order is handled by pnpm's topological sort.

Not set up: automated versioning (changesets), provenance attestations, a `repository` field in the
manifests (it needs the real repository URL), and CHANGELOG generation.
