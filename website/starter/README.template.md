# NexAPI starter

A small project to try NexAPI on your own computer, with a pet shop API included.
You need Node.js 22.12 or newer.

## Run it

```bash
npm install            # installs NexAPI from the files in ./vendor
npm run generate       # reads openapi.yaml and writes the typed client to src/api
npm run api            # starts the pet shop API on http://localhost:3000 (leave it running)
```

Open a second terminal in the same folder:

```bash
npm start              # runs src/main.ts against the API
```

You should see the pets listed, a new pet added, a typed 404 error, and the request counts
showing that identical requests are shared and cached.

## What to try next

- Open `src/api/types.ts`: these types were generated from `openapi.yaml`.
- Open `src/main.ts` and change `species: "cat"` to `species: "bird"`. Run `npm run check`:
  TypeScript rejects it, because the schema only allows cat or dog.
- Add a field to the `Pet` schema in `openapi.yaml`, run `npm run generate`, and watch the
  types change.
- Run `npm run generate:check`. It fails if `openapi.yaml` and `src/api` disagree, which is
  what you would run in CI.

## Files

| File                 | What it is                                             |
| -------------------- | ------------------------------------------------------ |
| `openapi.yaml`       | The API description. The one source of truth.          |
| `nexapi.config.json` | Generator settings.                                    |
| `server.mjs`         | The pet shop API (plain Node, no dependencies).        |
| `src/main.ts`        | Your program, using the generated client.              |
| `src/api/`           | Generated. Do not edit; run `npm run generate`.        |
| `vendor/`            | NexAPI **VERSION** packages, so no registry is needed. |
