# Setting up NexAPI and the website

Everything below was run from a clean unzip, in a folder whose path contains spaces.

## Requirements

- **Node.js 22.12 or newer** (`node --version`). Node 24 works too.
- **pnpm 10** (`npm install -g pnpm`, or `corepack enable`).
- Nothing else. No `zip` command, no global tools.

The same steps are in `website/README.md`.

## 1. Install

From the repository root (the folder containing `pnpm-workspace.yaml`):

```bash
pnpm install
```

pnpm may print a notice about ignored build scripts. It is not an error; nothing here needs them.

## 2. Run the website

```bash
pnpm website:dev
```

(or `pnpm --filter @nexapi/website dev`, or `pnpm dev` inside `website/`).

The first start takes about a minute. It first runs `website/scripts/prepare-downloads.mjs`, which:

1. builds all packages (`pnpm build`),
2. packs `@nexapi/*` tarballs, the source zip and the starter project zip into `website/public/downloads`,
3. writes `website/public/install.sh` and the checksum file,
4. writes `website/src/generated/search-index.json` and `downloads.json`.

Then Next.js starts at **http://localhost:3000**. These generated files are not committed; they are
recreated by every `dev` and `build`, so you never run a separate setup step.

## 3. Build the static site

```bash
pnpm website:build      # output in website/out
npx serve website/out   # preview it
```

Set these before building for production:

| Variable               | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_REPO_URL` | GitHub link shown in header, footer, Contribute page            |
| `NEXT_PUBLIC_SITE_URL` | Public origin, used in the `curl` install commands and metadata |

Example: `NEXT_PUBLIC_SITE_URL=https://nexapi.dev NEXT_PUBLIC_REPO_URL=https://github.com/you/nexapi pnpm website:build`

## 4. Verify the whole repo

```bash
pnpm check        # lint, typecheck, tests, build, generated-code check
pnpm smoke:pack   # installs the packed tarballs into an empty project and runs them
```

## 5. Try the starter project (what beginners download)

```bash
unzip website/public/downloads/nexapi-starter-0.0.1.zip -d /tmp/try
cd /tmp/try/nexapi-starter
npm install
npm run generate     # OpenAPI -> typed client in src/api
npm run api          # terminal 1: pet shop API on :3000
npm start            # terminal 2: the example program
```

## Troubleshooting

| Problem                                                      | Fix                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `Can't resolve '@/generated/search-index.json'`              | The generated files are missing. Run `pnpm website:dev` (it creates them) or `node website/scripts/prepare-downloads.mjs`. |
| `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` with `%20` in the path | Old scripts; use the current zip. Spaces in folder names are supported.                                                    |
| `Cannot find module @nexapi/core`                            | Run `pnpm install` at the repo root, not inside `website/` only.                                                           |
| Port 3000 busy                                               | `PORT=3001 pnpm website:dev` (Windows PowerShell: `$env:PORT=3001; pnpm website:dev`)                                      |
| Build fails on `./types.js` imports                          | Use the provided scripts: they call `next ... --webpack`, which maps `.js` imports to `.ts`.                               |
| Packages not found on npm                                    | They are not published yet. Use the tarballs, the starter zip or the workspace.                                            |
