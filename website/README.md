# NexAPI website

Official documentation site, playground and downloads for NexAPI. Next.js 16, static export.

See [SETUP.md](../SETUP.md) for the full guide. Run from the repository root (needs Node 22.12+ and pnpm). No separate setup step: `dev` and `build`
first run `scripts/prepare-downloads.mjs`, which builds the packages and creates the generated files
(`src/generated/*`, `public/downloads`, `public/install.sh`) that the pages import.

```bash
pnpm install
pnpm --filter @nexapi/website dev      # http://localhost:3000 (first start takes ~1 min)
pnpm --filter @nexapi/website build    # writes website/out (static)
pnpm --filter @nexapi/website typecheck
pnpm test                              # includes website/test (every doc example is executed)
```

## Configuration

| Variable               | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_REPO_URL` | Repository link shown in the header, footer, contribute page |
| `NEXT_PUBLIC_SITE_URL` | Public origin; used in install `curl` commands and metadata  |

`build` first runs `scripts/prepare-downloads.mjs`, which packs the workspace packages, the starter
project and `install.sh` (with SHA-256 checksums) into `public/`. Those outputs are git-ignored.

The playground runs the real `@nexapi/core`, `@nexapi/codegen`, `@nexapi/react` and devtools in the
browser against an in-memory mock API. Packages are not on npm yet; downloads are tarballs.

Next must build with `--webpack` because generated sources import `./x.js` that resolve to `.ts`.
