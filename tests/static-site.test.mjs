import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('public launcher exposes search, categories, app grid and subpath-safe assets', async () => {
  const html = await text('../index.html');
  assert.match(html, /id="app-search"/);
  assert.match(html, /id="category-chips"/);
  assert.match(html, /id="app-grid"/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
});

test('admin exposes token lock, package inputs, metadata fields and publish action', async () => {
  const html = await text('../admin/index.html');
  for (const id of ['token-input', 'unlock-button', 'file-input', 'folder-input', 'icon-input', 'app-name', 'app-slug', 'entry-select', 'publish-button', 'existing-apps']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /jszip@3\.10\.1/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
});

test('brand logos have static image sources and do not depend on JavaScript to appear', async () => {
  const publicHtml = await text('../index.html');
  const adminHtml = await text('../admin/index.html');
  assert.match(publicHtml, /<img[^>]+src="\.\/assets\/brand\/torsio-toletana-logo\.webp"[^>]*>/);
  assert.match(adminHtml, /<img[^>]+src="\.\.\/assets\/brand\/torsio-toletana-logo\.webp"[^>]*>/);
});

test('admin provides a direct GitHub fine-grained token creation link and Chinese setup steps', async () => {
  const html = await text('../admin/index.html');
  assert.match(html, /github\.com\/settings\/personal-access-tokens\/new/);
  assert.match(html, /Contents/);
  assert.match(html, /Read and write/);
  assert.match(html, /office_editor/);
});

test('admin source never persists credentials in browser storage', async () => {
  const source = await text('../assets/admin.mjs');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(source, /github_pat_[A-Za-z0-9_]+/);
});

test('brand module contains only runtime helpers, while the primary logo is served as a static asset', async () => {
  const source = await text('../assets/brand.mjs');
  assert.doesNotMatch(source, /data:image\/jpeg;base64,/);
});

test('initial catalog is a valid empty catalog', async () => {
  const raw = JSON.parse(await text('../data/catalog.json'));
  assert.deepEqual(raw, { schemaVersion: 1, apps: [] });
});
