# Releasing to npm

Seven packages are published together under the `@nyxapi` scope, always at the same version:
`@nyxapi/core`, `codegen`, `cli`, `react`, `devtools`, `graphql` and `trpc`. The website and benchmarks are private.

## One-time setup

1. **Claim the scope.** On npmjs.com create an organization named `nyxapi` (free plan, public packages).
   Turn on two-factor authentication for your account and the organization.
2. **Create a publish token.** npm → Access Tokens → Generate New Token → _Granular access token_.
   Permissions: Read and write, packages: all packages in the `@nyxapi` scope. Set an expiry.
3. **Add it to GitHub.** Repository → Settings → Secrets and variables → Actions → New secret →
   name `NPM_TOKEN`, value the token.
4. **Allow the release bot to open pull requests.** Settings → Actions → General → Workflow
   permissions → _Read and write permissions_, and tick _Allow GitHub Actions to create and
   approve pull requests_.
5. Push the repository to GitHub on a branch named `main`.

## Releasing

1. For every change that affects a package run `pnpm changeset`, choose the bump (patch, minor,
   major) and write one sentence. Commit the file with your change.
2. Merge to `main`. The `release` workflow opens a **Version packages** pull request that bumps
   versions and writes `CHANGELOG.md` files.
3. Merge that pull request. The workflow builds, checks, and runs `changeset publish`, which
   publishes every package whose version is not on npm yet, with provenance.

### Publishing 0.1.0

The repository is already at `0.1.0` (the changeset was applied and the changelogs written), and the
two new packages, `@nyxapi/graphql` and `@nyxapi/trpc`, are in the fixed group. `0.1.0` is not on npm,
so pushing to `main` (or running `pnpm release`) publishes it: `changeset publish` publishes every
package whose version is not on the registry yet. No new changeset is needed. After that, the
website's Releases page shows "latest on npm" for 0.1.0 by itself, because it reads the registry.

Install a specific version with `npm install @nyxapi/core@0.1.0`. If an old broken `0.0.0-stage`
version is on the registry, an unpinned install can pick it up; unpublish or deprecate it
(`npm deprecate @nyxapi/core@0.0.0-stage "not a release"`) and install by exact version.

Add an entry for every later release to `website/src/releases.ts` (the test fails if the newest
entry does not match `packages/core/package.json`).

## Check before you publish

```bash
pnpm check             # lint, typecheck, tests, generated code
pnpm smoke:pack        # packs, installs into an empty project, generates, type-checks and runs it
pnpm publish:dry       # npm's own dry run: lists every file that would be published
```

`pnpm publish:dry` needs `node scripts/set-repository.mjs owner/repo` to have run once if you want
the repository fields filled in locally. The release workflow does this automatically from the
GitHub repository it runs in.

## Publishing by hand (first time, from your computer)

```bash
npm login
node scripts/set-repository.mjs yourname/nyxapi
pnpm --filter @nyxapi/website prepare:site     # builds packages
pnpm -r --filter './packages/*' publish --access public --no-git-checks
```

Manual publishes have no provenance badge (the release workflow turns provenance on with
`NPM_CONFIG_PROVENANCE=true`, so it is not set in the package files, which would break local
publishing). Prefer the workflow once it is set up.

### Publishing 0.1.0 from your computer, step by step

```bash
npm login                      # with two-factor auth; you will be asked for a one-time code
pnpm install
pnpm publish:local             # prepare, check, smoke test, then publish all seven packages
# if npm asks for a one-time code on every package, pass it through:
#   pnpm -r --filter './packages/*' publish --access public --no-git-checks --otp 123456
npm view @nyxapi/core version  # should print 0.1.0
```

`pnpm` replaces the `workspace:*` dependency specs with the real version while packing, and
publishes dependencies before the packages that need them.

## After the first release

- Update `website/src/app/install/page.tsx` so the npm commands are the primary path.
