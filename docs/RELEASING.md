# Releasing to npm

Five packages are published together under the `@nyxapi` scope, always at the same version:
`@nyxapi/core`, `codegen`, `cli`, `react` and `devtools`. The website and benchmarks are private.

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

The first publish needs no changeset: the packages are at `0.0.1`, which is not on npm, so the
first run of `pnpm release` publishes it. To start at `0.1.0` instead, run `pnpm changeset`, pick
_minor_ for any package (they move together), merge, then merge the version pull request.

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

Manual publishes have no provenance badge. Prefer the workflow once it is set up.

## After the first release

- Remove the "not on the npm registry yet" notes from the website (`website/src/site.ts` and the
  docs pages that mention it) and from the package READMEs.
- Update `website/src/app/install/page.tsx` so the npm commands are the primary path.
