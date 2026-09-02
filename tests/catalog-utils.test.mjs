import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCatalog,
  listCategories,
  filterApps,
  catalogRecordFromMeta,
  upsertCatalogApp,
  removeCatalogApp,
} from '../assets/catalog-utils.mjs';

const apps = [
  { id: 'alpha', name: 'Alpha Sheet', description: 'Clean rows', category: 'Spreadsheet', featured: false },
  { id: 'beta', name: 'Beta PDF', description: 'Merge reports', category: 'Documents', featured: true },
  { id: 'gamma', name: 'Gamma Form', description: 'Office intake', category: 'Documents', featured: false },
];

test('normalizeCatalog accepts malformed input defensively', () => {
  assert.deepEqual(normalizeCatalog(null), { schemaVersion: 1, apps: [] });
  assert.deepEqual(normalizeCatalog({ schemaVersion: 1, apps: [apps[0]] }).apps, [apps[0]]);
});

test('listCategories produces unique locale-sorted categories', () => {
  assert.deepEqual(listCategories(apps), ['Documents', 'Spreadsheet']);
});

test('filterApps matches query across title description category and category chip', () => {
  assert.deepEqual(filterApps(apps, { query: 'merge', category: 'all' }).map((x) => x.id), ['beta']);
  assert.deepEqual(filterApps(apps, { query: '', category: 'Documents' }).map((x) => x.id), ['beta', 'gamma']);
  assert.deepEqual(filterApps(apps, { query: 'office', category: 'Documents' }).map((x) => x.id), ['gamma']);
});

test('catalogRecordFromMeta computes subpath-safe repository-relative asset paths', () => {
  const record = catalogRecordFromMeta({
    id: 'invoice-helper',
    name: 'Invoice Helper',
    description: 'Invoices',
    category: 'Finance',
    entry: 'index.html',
    icon: 'icon.png',
    version: '1.2.0',
    featured: true,
    publishedAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T01:00:00.000Z',
  }, 'invoice-helper');
  assert.equal(record.launchPath, 'apps/invoice-helper/index.html');
  assert.equal(record.iconPath, 'apps/invoice-helper/icon.png');
});

test('upsertCatalogApp replaces by id and sorts featured apps first then name', () => {
  const catalog = { schemaVersion: 1, apps: [apps[0], apps[2]] };
  const next = upsertCatalogApp(catalog, apps[1]);
  assert.deepEqual(next.apps.map((x) => x.id), ['beta', 'alpha', 'gamma']);
  const replaced = upsertCatalogApp(next, { ...apps[0], name: 'Aardvark' });
  assert.equal(replaced.apps.filter((x) => x.id === 'alpha').length, 1);
  assert.equal(replaced.apps.find((x) => x.id === 'alpha').name, 'Aardvark');
});

test('removeCatalogApp removes only the requested id', () => {
  assert.deepEqual(removeCatalogApp({ schemaVersion: 1, apps }, 'beta').apps.map((x) => x.id), ['alpha', 'gamma']);
});
