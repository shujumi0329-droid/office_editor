# Torsio Toletana Office Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished GitHub Pages office-tool launcher and browser publisher that accepts single HTML files or complete app packages and publishes them atomically to `office_editor`.

**Architecture:** A static public launcher reads `data/catalog.json`; a separate static `/admin/` publisher performs package normalization in-browser and writes app assets plus catalog metadata through GitHub Git Data REST APIs. A Python catalog builder and GitHub Actions workflow provide repository-side reconciliation for manual metadata edits.

**Tech Stack:** HTML5, modern CSS, vanilla ES modules, JSZip loaded from a pinned CDN for ZIP parsing, GitHub REST API, Python 3 standard library, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-office-deck-design.md`

## Global Constraints

- Public site must work from the GitHub Pages project subpath `/office_editor/`.
- Admin token stays in page memory only and must never be persisted.
- Single `.html`, `.zip`, and directory packages share one publishing workflow.
- App package guardrails are 20 MiB total and 300 files.
- Existing app relative file paths must be preserved.
- Repository content and published apps are public.
- Public launcher depends only on static files and `data/catalog.json`.

---

### Task 1: Static launcher shell and brand system

**Files:**
- Create: `index.html`
- Create: `assets/portal.css`
- Create: `assets/portal.js`
- Create: `assets/brand.js`
- Create: `data/catalog.json`

**Interfaces:**
- Consumes: `data/catalog.json`
- Produces: public launcher UI and `window.TorsioBrand.logoDataUri`

- [ ] Create the launcher markup with branded header, search, category controls, app grid, empty/error states, and footer.
- [ ] Implement responsive visual system using company geometry/colors, accessible focus states, and reduced-motion handling.
- [ ] Implement catalog fetch, search, category filtering, icon fallback, and new-tab launch behavior.
- [ ] Add an empty catalog fixture and verify the launcher renders without console errors.
- [ ] Commit launcher implementation.

### Task 2: Package normalization and metadata helpers

**Files:**
- Create: `assets/package-utils.js`
- Create: `tests/package-utils.test.mjs`

**Interfaces:**
- Produces: `slugify`, `sanitizePackagePath`, `normalizeEntries`, `detectEntryPoint`, `stripCommonRoot`, `buildFallbackIconDataUri`

- [ ] Write Node tests for slugging, path traversal rejection, redundant-root stripping, and HTML entry detection.
- [ ] Run tests and confirm they fail before implementation.
- [ ] Implement minimal package utility functions.
- [ ] Run tests and confirm they pass.
- [ ] Commit package utilities.

### Task 3: Admin publisher interface

**Files:**
- Create: `admin/index.html`
- Create: `assets/admin.js`

**Interfaces:**
- Consumes: package helper functions, `data/catalog.json`, GitHub REST API
- Produces: token lock/unlock state, package ingestion, metadata editor, atomic GitHub publish/delete operations

- [ ] Build locked credential screen with least-privilege instructions and no persistent storage.
- [ ] Build file/ZIP/folder ingestion and package inspection UI.
- [ ] Build metadata editor and custom icon preview/fallback.
- [ ] Implement repository token validation.
- [ ] Implement Git Data API helpers for refs, blobs, trees, commits, and ref updates.
- [ ] Implement atomic publish path that uploads package + `app.meta.json` + updated catalog in one commit.
- [ ] Implement existing-app management and atomic removal.
- [ ] Verify no persistent-storage APIs are used for the token.
- [ ] Commit admin publisher.

### Task 4: Catalog reconciliation workflow

**Files:**
- Create: `scripts/build_catalog.py`
- Create: `tests/test_build_catalog.py`
- Create: `.github/workflows/catalog.yml`

**Interfaces:**
- Consumes: `apps/*/app.meta.json`
- Produces: deterministic `data/catalog.json`

- [ ] Write Python tests for valid metadata, deterministic ordering, computed paths, and invalid metadata rejection.
- [ ] Run tests and confirm failure before implementation.
- [ ] Implement standard-library catalog builder.
- [ ] Run tests and confirm pass.
- [ ] Add GitHub Actions workflow that rebuilds catalog when app metadata changes and commits only when needed.
- [ ] Commit reconciliation workflow.

### Task 5: Documentation, deployment readiness, and final verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Documents publisher token scope, GitHub Pages setup, package format, and public-content warning.

- [ ] Document how to enable Pages from `main` root.
- [ ] Document fine-grained token permissions and publisher URL.
- [ ] Document single-HTML, ZIP, and folder publishing flows.
- [ ] Run all Node and Python tests.
- [ ] Scan repository source for `localStorage`, `sessionStorage`, hard-coded tokens, root-absolute asset paths, and placeholder text.
- [ ] Inspect generated launcher/admin pages for subpath-safe links.
- [ ] Commit documentation and verification fixes.
