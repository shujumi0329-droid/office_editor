function sortApps(apps) {
  return [...apps].sort((a, b) => {
    const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featured) return featured;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' });
  });
}

export function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.apps)) return { schemaVersion: 1, apps: [] };
  return { schemaVersion: 1, apps: raw.apps.filter((app) => app && typeof app === 'object') };
}

export function listCategories(apps) {
  return [...new Set((apps ?? []).map((app) => String(app.category ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function filterApps(apps, { query = '', category = 'all' } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  return (apps ?? []).filter((app) => {
    const categoryMatch = category === 'all' || String(app.category ?? '') === category;
    if (!categoryMatch) return false;
    if (!needle) return true;
    return [app.name, app.description, app.category, app.version]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
  });
}

export function catalogRecordFromMeta(meta, slug) {
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description ?? '',
    category: meta.category ?? 'Office',
    version: meta.version ?? '1.0.0',
    featured: Boolean(meta.featured),
    entry: meta.entry,
    icon: meta.icon ?? '',
    publishedAt: meta.publishedAt,
    updatedAt: meta.updatedAt,
    launchPath: `apps/${slug}/${meta.entry}`,
    iconPath: meta.icon ? `apps/${slug}/${meta.icon}` : '',
  };
}

export function upsertCatalogApp(catalog, app) {
  const normalized = normalizeCatalog(catalog);
  const apps = normalized.apps.filter((item) => item.id !== app.id);
  apps.push(app);
  return { schemaVersion: 1, apps: sortApps(apps) };
}

export function removeCatalogApp(catalog, id) {
  const normalized = normalizeCatalog(catalog);
  return { schemaVersion: 1, apps: sortApps(normalized.apps.filter((item) => item.id !== id)) };
}
