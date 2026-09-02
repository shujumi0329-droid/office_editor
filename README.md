# Torsio Toletana Office Deck

A static GitHub Pages launcher and publisher for Torsio Toletana office HTML tools.

## Public launcher

When GitHub Pages is enabled for this repository, the portal is served at:

`https://shujumi0329-droid.github.io/office_editor/`

The launcher reads `data/catalog.json` and renders each published app as a searchable, categorized app card. Each tool opens as its own page so its relative CSS, JavaScript, image, font, and data paths keep working.

## One-time GitHub Pages setup

This repository is designed for the simplest Pages configuration:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.

After that one-time setting, commits made by the Publisher automatically flow to GitHub Pages; no manual site rebuild or re-upload is needed.

## Publisher

Open:

`https://shujumi0329-droid.github.io/office_editor/admin/`

Create a **Fine-grained personal access token** with:

- Repository access: **Only select repositories → office_editor**
- Repository permissions → **Contents: Read and write**

The Publisher keeps the token only in the active page's JavaScript memory. It is never committed or written to browser persistent storage. Reloading the page or pressing **Lock** clears access.

### Supported uploads

- One `.html` / `.htm` file
- One `.zip` containing a complete app
- A complete folder selected or dragged from the desktop

The Publisher preserves relative paths, strips one redundant package root directory, ignores `.DS_Store` / `__MACOSX`, auto-selects root `index.html`, and auto-selects the only HTML file when there is exactly one. It asks for an entry file only when multiple HTML files are genuinely ambiguous.

Guardrails: maximum **300 files**, maximum **20 MiB** total package size, and maximum **5 MiB** custom icon size.

## Custom app icons

PNG, JPG/JPEG, WebP, and SVG icons are accepted. If no icon is supplied, the launcher creates a local Torsio-branded geometric fallback using the app initials.

## Atomic publishing

The browser Publisher uses GitHub's Git Data API and performs each publish as one commit:

1. Resolve the current `main` commit and tree.
2. Create blobs for app files, metadata, icon, and catalog.
3. Create a new tree based on the current tree.
4. Create one commit.
5. Fast-forward `main` to the new commit.

If `main` changes during the operation, the non-forced ref update fails rather than overwriting someone else's newer work; publishing can then be retried against the fresh head.

## App package format

Published apps live in:

```text
apps/<slug>/
  index.html            # or another selected HTML entry
  app.meta.json
  icon.png              # optional; extension may vary
  css/...
  js/...
  images/...
```

Example metadata:

```json
{
  "id": "invoice-helper",
  "name": "Invoice Helper",
  "description": "Prepare invoice data",
  "category": "Finance",
  "entry": "index.html",
  "icon": "icon.png",
  "version": "1.0.0",
  "featured": false,
  "publishedAt": "2026-09-02T00:00:00.000Z",
  "updatedAt": "2026-09-02T00:00:00.000Z"
}
```

## Catalog reconciliation

`scripts/build_catalog.py` rebuilds `data/catalog.json` from every `apps/*/app.meta.json`. The `Rebuild app catalog` GitHub Action runs when `apps/**` changes, so direct repository edits also converge to a valid catalog.

## Security model

`office_editor` is public. Treat every file under `apps/` and every catalog field as public internet content. Do not upload API secrets, passwords, private datasets, authentication cookies, or credentials embedded in HTML/JavaScript.

The Publisher validates relative paths and rejects traversal or absolute package paths. Tool HTML is opened as a standalone GitHub Pages document rather than injected into the portal DOM.

## Local verification

No package installation is required.

```bash
node --test tests/package-utils.test.mjs tests/catalog-utils.test.mjs tests/github-client.test.mjs tests/static-site.test.mjs
python3 -m unittest tests/test_build_catalog.py
node --check assets/portal.mjs
node --check assets/admin.mjs
```
