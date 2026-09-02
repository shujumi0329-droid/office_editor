# Torsio Toletana Office Deck — Design Specification

## Purpose
Build a public GitHub Pages portal for Torsio Toletana office HTML tools. Visitors see a polished app-launcher interface and can open each published tool. The repository owner gets a browser-based publisher at `/admin/` that can upload either a single HTML file or a complete app package, assign metadata and a custom icon, and publish changes directly to this repository.

## Product principles
- Publishing should be drag-drop-first and require as few decisions as possible.
- Single HTML files and multi-file apps must use the same workflow.
- Existing relative CSS/JS/image/font paths must keep working after publication.
- Public visitors never need GitHub credentials.
- The admin credential must never be committed, embedded, or persisted to localStorage.
- The public catalog must remain static-host friendly and require no database or paid backend.
- The interface must carry Torsio Toletana branding and use the supplied company logo.

## Repository layout
```text
/
  index.html                 Public app launcher
  admin/index.html           Browser publisher
  assets/portal.css          Shared portal/admin visual system
  assets/portal.js           Public catalog rendering/search/filter
  assets/admin.js            Publisher UI and GitHub REST client
  assets/brand.js            Embedded optimized company logo data
  data/catalog.json          Public catalog manifest
  apps/<slug>/...            Published tool packages
  scripts/build_catalog.py   Rebuilds catalog from app metadata
  .github/workflows/catalog.yml
  README.md
```

## App package contract
Every published app lives under `apps/<slug>/` and includes `app.meta.json` with:

```json
{
  "id": "invoice-helper",
  "name": "Invoice Helper",
  "description": "Short human-readable description",
  "category": "Office",
  "entry": "index.html",
  "icon": "icon.png",
  "version": "1.0.0",
  "featured": false,
  "publishedAt": "2026-09-02T00:00:00.000Z",
  "updatedAt": "2026-09-02T00:00:00.000Z"
}
```

`icon` may be PNG, JPEG, WebP, SVG, or empty. An empty icon uses a generated branded fallback in the launcher.

## Input normalization
The publisher accepts:
1. A single `.html` file.
2. A `.zip` containing an HTML app and supporting assets.
3. A selected or dropped directory containing an HTML app and supporting assets.

Normalization rules:
- Ignore macOS metadata (`__MACOSX`, `.DS_Store`).
- Strip one redundant top-level directory from ZIP/folder packages when every file shares it.
- If there is an `index.html`, use it automatically.
- If exactly one HTML file exists, use it automatically.
- Only when multiple HTML files exist without `index.html` does the UI request an entry file.
- Preserve all other relative paths exactly.
- Slug is derived from the chosen app name and can be edited before publication.

## GitHub authentication
Admin uses a Fine-grained Personal Access Token scoped only to `shujumi0329-droid/office_editor` with repository Contents read/write permission. Token handling:
- Stored only in JavaScript memory for the active page session.
- Never written to localStorage, sessionStorage, IndexedDB, cookies, repository files, query strings, or analytics.
- A lock button clears it immediately.
- API failures that indicate bad/expired permission return the UI to the locked state.

## Atomic publication
The publisher uses GitHub Git Data REST APIs to create one commit per publish operation:
1. Read `refs/heads/main` and the current root tree.
2. Create blobs for all app files plus `app.meta.json` and updated `data/catalog.json`.
3. Create a tree based on the current tree.
4. Create one commit.
5. Fast-forward `refs/heads/main` to the new commit.

Binary files are sent as base64 blobs; UTF-8 text is sent as UTF-8. File count/size is shown before publishing. The UI blocks extremely large packages before attempting API writes.

## Catalog
`data/catalog.json` is the only file read by the public launcher. Admin updates it in the same atomic commit as the uploaded app. A GitHub Actions workflow also runs `scripts/build_catalog.py` when `apps/**/app.meta.json` changes so repository-side edits converge back to a valid catalog.

Catalog records expose only public app metadata and a computed launch URL. No credential or private state appears in the catalog.

## Public launcher UX
- Responsive Torsio Toletana header with supplied logo.
- App-grid cards with custom icon, title, description, category, and open action.
- Search field filters instantly by title, description, and category.
- Category chips are generated from the catalog.
- Empty state clearly explains that no tools are published yet.
- App links open in a new tab by default to preserve the launcher.
- Keyboard accessible focus states and reduced-motion support.

## Admin UX
- Locked landing state explains the least-privilege token requirement.
- After authentication: drop zone, folder picker, and file picker.
- Package inspection shows detected files, entry point, total size, and warnings.
- Metadata editor provides name, slug, description, category, version, featured toggle, and custom icon picker/drop area.
- Icon preview uses the supplied icon; fallback uses a branded geometric tile generated locally.
- Publish button shows staged progress: preparing, creating blobs, committing, published.
- Existing apps are loaded from the public catalog so metadata/icon can be republished or an app can be removed.

## Safety and limits
- Repository is public; admin UI warns that uploaded HTML, JS, data, and assets become public.
- Publisher rejects path traversal (`../`), absolute paths, null bytes, and files outside the app package root.
- Default maximum package size: 20 MiB total and 300 files. These are client-side guardrails to keep browser/API publishing reliable.
- SVG icons are displayed as image resources and are never injected into DOM as raw markup.
- Tool HTML runs as its own GitHub Pages document rather than being embedded in an iframe in the portal.

## Deployment
GitHub Pages serves the repository from the `main` branch root. The implementation should be compatible with the standard project URL `https://shujumi0329-droid.github.io/office_editor/` once Pages is enabled for `main`/root in repository settings.

## Verification
- Public launcher renders correctly with an empty catalog.
- Catalog rendering/search/filter works with fixture records.
- Single-HTML normalization, ZIP normalization, directory normalization, entry detection, slugging, and unsafe-path rejection are unit-tested where practical.
- `build_catalog.py` validates metadata and creates deterministic JSON.
- Admin token is absent from generated repository content and browser persistent-storage calls.
- All static paths work from a GitHub Pages project subpath, not only `/`.
