# Auto-release GitHub Action — Design

**Date:** 2026-05-31
**Status:** Approved

## Goal

Automatically build and publish the userscript as a GitHub Release whenever
`package.json`'s version changes on `main`, and wire the script's metadata so
Tampermonkey can auto-update from those releases.

`package.json` is the single source of truth for the version. The release tag is
**derived** from it — there is no manual tagging step.

## Trigger

- `push` to `main`
- `workflow_dispatch` (manual run)

## Workflow: `.github/workflows/release.yml`

Single job. Steps in order:

1. **Checkout** with full history and tags (`fetch-depth: 0`).
2. **Toolchain:** `pnpm/action-setup@v4` (picks up the pinned `pnpm@10.9.0` from
   the `packageManager` field), then `actions/setup-node@v4` with Node 22 and
   `cache: pnpm`. Install with `pnpm install --frozen-lockfile`.
3. **Read version:** extract `version` from `package.json` into `VERSION`; the
   target tag is `v$VERSION`.
4. **Idempotency check:** if a release tagged `v$VERSION` already exists, exit
   cleanly without releasing. Consequence: ordinary pushes to `main` are no-ops;
   only a version bump produces a release.
5. **Gate:** `pnpm lint`, then `pnpm test`. Any failure aborts before publishing.
6. **Build:** `pnpm build` → `dist/claude-artifact-exporter.user.js`.
7. **Publish:** `gh release create v$VERSION dist/claude-artifact-exporter.user.js
   --title "v$VERSION" --generate-notes`. `gh` creates the tag at the current
   commit and uploads the asset.

**Permissions:** `contents: write`, using the built-in `GITHUB_TOKEN`. No secrets
to configure.

### Release ritual for the maintainer

Bump `version` in `package.json` → commit → push/merge to `main`. The workflow does
the rest.

## Metadata changes: `vite.config.ts`

The userscript metadata block is generated from `vite.config.ts` (never
hand-written). Changes:

- Add `updateURL` and `downloadURL`, both set to:
  `https://github.com/gky99/claude-artifact-exporter/releases/latest/download/claude-artifact-exporter.user.js`
  The `releases/latest/download/<asset>` path always redirects to the newest
  release's asset, and the built asset filename is stable.
- `@version` is left to vite-plugin-monkey's default, which reads `package.json`'s
  `version` — so it stays in sync with the source of truth automatically.
- Replace the placeholders: `namespace` →
  `https://github.com/gky99/claude-artifact-exporter`, `author` → `gky99`.

## Testing & verification

The workflow's only logic is the version / release-exists check, kept as a small,
readable shell step. Verification:

- Run `pnpm build` locally and confirm the generated metadata block contains the
  new `@updateURL` and `@downloadURL` lines.
- The workflow itself is validated on first push to the GitHub remote.

## Out of scope

- CI on every push/PR (this is release-only by choice).
- `.meta.js` generation for update checks (the full `.user.js` is used for both
  update and download).
- Changelog automation beyond `gh --generate-notes`.

## Preconditions / notes

- The repo currently has **no git remote**. The workflow file is created now but
  stays dormant until a GitHub remote (`gky99/claude-artifact-exporter`) is added
  and `main` is pushed.
- First run will release the current `package.json` version (`0.1.0`) as `v0.1.0`.
