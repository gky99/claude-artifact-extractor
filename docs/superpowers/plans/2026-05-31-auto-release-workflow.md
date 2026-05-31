# Auto-release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every push to `main`, automatically build and publish the userscript as a GitHub Release when `package.json`'s version hasn't been released yet, and wire the script metadata so Tampermonkey auto-updates from those releases.

**Architecture:** `package.json` `version` is the single source of truth. A two-job GitHub Actions workflow (`check` → `release`) reads that version, skips if a `v<version>` release already exists, otherwise gates on lint+test, builds, and publishes a release whose tag `gh` creates at the triggering commit. The userscript's `@updateURL`/`@downloadURL` point at the stable `releases/latest/download/` asset so installed copies auto-update; `@version` is left to vite-plugin-monkey's default (reads `package.json`).

**Tech Stack:** GitHub Actions, `gh` CLI (preinstalled on runners), pnpm 10.9.0, Node 22, Vite + vite-plugin-monkey.

**Spec:** `docs/superpowers/specs/2026-05-31-auto-release-workflow-design.md`

---

### Task 1: Userscript metadata (auto-update URLs + fill placeholders)

**Files:**
- Modify: `vite.config.ts:9-27` (the `userscript` block)

**Context:** vite-plugin-monkey maps the camelCase `userscript` keys to `@`-metadata lines. `downloadURL`/`updateURL` become `@downloadURL`/`@updateURL`. The built asset is named after `package.json`'s `name` (`claude-artifact-extractor`), so the output is `dist/claude-artifact-extractor.user.js` — matching the URL below. `version` is intentionally omitted so vite-plugin-monkey falls back to `package.json`'s `version`.

- [ ] **Step 1: Edit the `userscript` block in `vite.config.ts`**

Replace the placeholder `namespace`/`author` and add the two URLs. The block should read:

```ts
      userscript: {
        name: "Claude Artifact Extractor",
        namespace: "https://github.com/gky99/claude-artifact-extractor",
        description:
          "Export Claude research artifacts to Markdown with inline references preserved.",
        author: "gky99",
        match: ["https://claude.ai/*"],
        downloadURL:
          "https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js",
        updateURL:
          "https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js",
        // We capture page data by patching fetch, so run as early as possible
        // in the page context (not a sandbox) so window.fetch is the real one.
        "run-at": "document-start",
        grant: [
          "GM_registerMenuCommand",
          "GM_unregisterMenuCommand",
          "GM_setClipboard",
          "GM_addStyle",
          "GM_getValue",
          "GM_setValue",
        ],
      },
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds `dist/claude-artifact-extractor.user.js` with no errors.

- [ ] **Step 3: Verify the generated metadata header**

Run:
```bash
node -e "const s=require('fs').readFileSync('dist/claude-artifact-extractor.user.js','utf8'); console.log(s.slice(0, s.indexOf('==/UserScript==')))"
```
Expected: the printed header contains all of:
- `@namespace   https://github.com/gky99/claude-artifact-extractor`
- `@author      gky99`
- `@version     0.1.0`
- `@downloadURL https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js`
- `@updateURL   https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js`

(Column spacing is normalized by vite-plugin-monkey; only the keys/values matter.)

- [ ] **Step 4: Confirm lint still passes**

Run: `pnpm lint`
Expected: PASS (eslint + tsc clean).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add auto-update URLs and fill userscript author/namespace"
```

---

### Task 2: Auto-release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Context:** GitHub-hosted `ubuntu-latest` runners have `node` and `gh` preinstalled, so the lightweight `check` job needs no toolchain setup. `gh release create <tag>` creates the git tag at the triggering commit (`GITHUB_SHA`) when it doesn't already exist, and uploads the listed asset. `gh` authenticates via the `GH_TOKEN` env var; `github.token` is the built-in `GITHUB_TOKEN`. The `check` job's `should_release` output guards the `release` job so ordinary pushes (no version bump) are no-ops.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/release.yml` with exactly:

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
      should_release: ${{ steps.check.outputs.should_release }}
    steps:
      - uses: actions/checkout@v4

      - name: Read version from package.json
        id: ver
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Check whether this version is already released
        id: check
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if gh release view "v${{ steps.ver.outputs.version }}" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "Release v${{ steps.ver.outputs.version }} already exists — skipping."
            echo "should_release=false" >> "$GITHUB_OUTPUT"
          else
            echo "Release v${{ steps.ver.outputs.version }} not found — will publish."
            echo "should_release=true" >> "$GITHUB_OUTPUT"
          fi

  release:
    needs: check
    if: needs.check.outputs.should_release == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "v${{ needs.check.outputs.version }}" \
            dist/claude-artifact-extractor.user.js \
            --title "v${{ needs.check.outputs.version }}" \
            --generate-notes
```

- [ ] **Step 2: Verify the YAML is well-formed and the asset path matches the build output**

Confirm by inspection that:
- The `release` job's `gh release create` references `dist/claude-artifact-extractor.user.js` — the exact filename produced by `pnpm build` (verified in Task 1, Step 2).
- Indentation is valid YAML (2-space, jobs nested under `jobs:`).

If `actionlint` happens to be installed locally, optionally run `actionlint .github/workflows/release.yml` (expected: no output). It is not a project dependency, so skipping it is fine — GitHub validates the workflow on push.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: auto-release workflow — build & publish on version bump"
```

---

### Task 3: First end-to-end validation (manual, on GitHub)

**Files:** none (operational verification).

**Context:** The workflow only runs on GitHub. This task confirms it behaves correctly once pushed. The spec accepts that the workflow itself is validated on first push.

- [ ] **Step 1: Push the branch to GitHub and merge to `main`**

Push the commits from Tasks 1–2 to `main` (via the project's normal integration path).

- [ ] **Step 2: Observe the workflow run**

In the GitHub repo's **Actions** tab, confirm the `Release` workflow ran on the push to `main`:
- The `check` job reports either "will publish" (first time for `0.1.0`) or "already exists — skipping".
- If publishing: `release` job runs lint → test → build → create release, all green.

- [ ] **Step 3: Verify the Release and auto-update URL**

- Under **Releases**, confirm a `v0.1.0` release exists with `claude-artifact-extractor.user.js` attached.
- Confirm this URL resolves (HTTP 200, redirects to the asset):
  `https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js`

- [ ] **Step 4: Confirm idempotency**

Push any trivial non-version change to `main` (or re-run the workflow via **Run workflow**). Confirm the `check` job reports "already exists — skipping" and the `release` job is skipped (no duplicate release/tag).
