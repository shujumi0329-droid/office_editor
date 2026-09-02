import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  sanitizePackagePath,
  stripCommonRoot,
  detectEntryPoint,
  normalizeEntries,
  buildFallbackIconDataUri,
  isPublisherReservedPath,
} from '../assets/package-utils.mjs';

test('slugify creates stable URL-safe slugs', () => {
  assert.equal(slugify('  Invoice & Tax Helper  '), 'invoice-tax-helper');
  assert.match(slugify('表格清理器'), /^app-[a-z0-9]{6}$/);
});

test('sanitizePackagePath normalizes safe relative paths', () => {
  assert.equal(sanitizePackagePath('./assets\\css/main.css'), 'assets/css/main.css');
  assert.equal(sanitizePackagePath('folder/./index.html'), 'folder/index.html');
});

test('sanitizePackagePath rejects path traversal and absolute paths', () => {
  for (const path of ['../secret.txt', 'a/../../secret.txt', '/etc/passwd', 'C:\\secret.txt', 'bad\0name']) {
    assert.throws(() => sanitizePackagePath(path));
  }
});

test('stripCommonRoot removes one redundant top-level package directory', () => {
  const entries = [
    { path: 'bundle/index.html', value: 1 },
    { path: 'bundle/js/app.js', value: 2 },
  ];
  assert.deepEqual(stripCommonRoot(entries), [
    { path: 'index.html', value: 1 },
    { path: 'js/app.js', value: 2 },
  ]);
});

test('stripCommonRoot leaves mixed-root packages untouched', () => {
  const entries = [
    { path: 'index.html', value: 1 },
    { path: 'assets/app.js', value: 2 },
  ];
  assert.deepEqual(stripCommonRoot(entries), entries);
});

test('detectEntryPoint prefers root index.html then a sole HTML file', () => {
  assert.deepEqual(detectEntryPoint(['assets/a.js', 'index.html', 'other.html']), {
    entry: 'index.html',
    candidates: ['index.html', 'other.html'],
    needsChoice: false,
  });
  assert.deepEqual(detectEntryPoint(['tool.html', 'assets/a.js']), {
    entry: 'tool.html',
    candidates: ['tool.html'],
    needsChoice: false,
  });
});

test('detectEntryPoint requests a choice only for ambiguous multi-html packages', () => {
  assert.deepEqual(detectEntryPoint(['a.html', 'b.html', 'x.js']), {
    entry: null,
    candidates: ['a.html', 'b.html'],
    needsChoice: true,
  });
});

test('normalizeEntries filters metadata, sanitizes paths and strips common root', () => {
  const result = normalizeEntries([
    { path: 'bundle/index.html', bytes: new Uint8Array([1]) },
    { path: 'bundle/.DS_Store', bytes: new Uint8Array([2]) },
    { path: '__MACOSX/junk', bytes: new Uint8Array([3]) },
    { path: 'bundle/assets/app.js', bytes: new Uint8Array([4]) },
  ]);
  assert.deepEqual(result.map((item) => item.path), ['index.html', 'assets/app.js']);
});

test('buildFallbackIconDataUri returns a local SVG image data URI', () => {
  const uri = buildFallbackIconDataUri('Invoice Helper');
  assert.match(uri, /^data:image\/svg\+xml;charset=UTF-8,/);
  assert.match(decodeURIComponent(uri.split(',')[1]), /IH/);
});

test('normalizeEntries reserves app.meta.json for publisher-managed metadata', () => {
  const result = normalizeEntries([
    { path: 'bundle/index.html', bytes: new Uint8Array([1]) },
    { path: 'bundle/app.meta.json', bytes: new Uint8Array([2]) },
    { path: 'bundle/data.json', bytes: new Uint8Array([3]) },
  ]);
  assert.deepEqual(result.map((item) => item.path), ['index.html', 'data.json']);
});

test('isPublisherReservedPath protects generated metadata and a selected custom icon path', () => {
  assert.equal(isPublisherReservedPath('app.meta.json'), true);
  assert.equal(isPublisherReservedPath('icon.png', 'icon.png'), true);
  assert.equal(isPublisherReservedPath('assets/icon.png', 'icon.png'), false);
  assert.equal(isPublisherReservedPath('data.json', 'icon.png'), false);
});
