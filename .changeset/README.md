# Changesets

Run `pnpm changeset` for any change that affects a published package. Pick the packages, the bump
type (patch, minor or major) and write one sentence for the changelog. Commit the generated file.

The five `@nyxapi/*` packages are versioned together. Merging to `main` opens a "Version packages"
pull request; merging that publishes to npm. See `docs/RELEASING.md`.
