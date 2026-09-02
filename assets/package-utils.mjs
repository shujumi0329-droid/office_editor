const BRAND_COLORS = ['#f4ad14', '#df3b1d', '#14527c', '#171719'];

function hash6(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(-6);
}

export function slugify(value) {
  const source = String(value ?? '').trim();
  const ascii = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return ascii || `app-${hash6(source || 'app')}`;
}

export function sanitizePackagePath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('檔案路徑不可為空白。');
  if (value.includes('\0')) throw new Error(`不安全的檔案路徑：${value}`);
  const normalized = value.replaceAll('\\', '/').trim();
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`不允許絕對路徑：${value}`);
  }
  const parts = normalized.split('/');
  if (parts.includes('..')) throw new Error(`不允許上層路徑：${value}`);
  const clean = parts.filter((part) => part && part !== '.');
  if (!clean.length) throw new Error(`無效的檔案路徑：${value}`);
  return clean.join('/');
}

export function stripCommonRoot(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  const segments = entries.map((entry) => String(entry.path).split('/'));
  if (segments.some((parts) => parts.length < 2)) return entries;
  const root = segments[0][0];
  if (!segments.every((parts) => parts[0] === root)) return entries;
  return entries.map((entry) => ({ ...entry, path: entry.path.slice(root.length + 1) }));
}

export function detectEntryPoint(paths) {
  const candidates = [...new Set(paths.filter((path) => /\.html?$/i.test(path)))].sort((a, b) => a.localeCompare(b));
  const rootIndex = candidates.find((path) => path.toLowerCase() === 'index.html');
  if (rootIndex) return { entry: rootIndex, candidates, needsChoice: false };
  if (candidates.length === 1) return { entry: candidates[0], candidates, needsChoice: false };
  return { entry: null, candidates, needsChoice: candidates.length > 1 };
}

export function normalizeEntries(entries) {
  const clean = [];
  const seen = new Set();
  for (const entry of entries ?? []) {
    if (!entry || entry.directory) continue;
    const path = sanitizePackagePath(entry.path);
    if (path.startsWith('__MACOSX/') || path.split('/').includes('__MACOSX')) continue;
    const basename = path.split('/').at(-1);
    if (basename === '.DS_Store') continue;
    if (basename.toLowerCase() === 'app.meta.json') continue;
    if (seen.has(path)) throw new Error(`套件內有重複路徑：${path}`);
    seen.add(path);
    clean.push({ ...entry, path });
  }
  return stripCommonRoot(clean);
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

function initialsFor(name) {
  const text = String(name ?? '').trim();
  if (!text) return 'TT';
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${[...words[0]][0] ?? ''}${[...words[1]][0] ?? ''}`.toUpperCase();
  return [...text].slice(0, 2).join('').toUpperCase();
}

export function buildFallbackIconDataUri(name) {
  const initials = escapeXml(initialsFor(name));
  const seed = parseInt(hash6(name), 36);
  const accent = BRAND_COLORS[seed % BRAND_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="58" fill="#f7f3ec"/><path d="M0 0h128v128H0z" fill="${accent}"/><path d="M128 128h128v128H128z" fill="#171719"/><circle cx="190" cy="66" r="42" fill="#14527c"/><path d="M0 176a80 80 0 0 1 80-80v160H0z" fill="#df3b1d"/><text x="128" y="148" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="800" fill="#fff" stroke="#171719" stroke-width="5" paint-order="stroke">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function isPublisherReservedPath(path, reservedIconPath = '') {
  const normalized = sanitizePackagePath(path);
  if (normalized.toLowerCase() === 'app.meta.json') return true;
  return Boolean(reservedIconPath) && normalized === sanitizePackagePath(reservedIconPath);
}
