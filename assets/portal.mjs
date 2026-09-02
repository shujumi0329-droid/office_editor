import { LOGO_DATA_URI } from './brand.mjs';
import { buildFallbackIconDataUri } from './package-utils.mjs';
import { normalizeCatalog, listCategories, filterApps } from './catalog-utils.mjs';

const els = {
  search: document.querySelector('#app-search'),
  chips: document.querySelector('#category-chips'),
  grid: document.querySelector('#app-grid'),
  count: document.querySelector('#tool-count'),
  loading: document.querySelector('#loading-state'),
  empty: document.querySelector('#empty-state'),
  error: document.querySelector('#error-state'),
  errorMessage: document.querySelector('#error-message'),
};

for (const logo of document.querySelectorAll('[data-brand-logo]')) logo.src = LOGO_DATA_URI;
document.querySelector('#footer-year').textContent = new Date().getFullYear();

const state = { apps: [], category: 'all', query: '' };

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appUrl(path) {
  return new URL(path, document.baseURI).href;
}

function renderCategories() {
  els.chips.replaceChildren();
  const categories = ['all', ...listCategories(state.apps)];
  for (const category of categories) {
    const button = make('button', `category-chip${state.category === category ? ' active' : ''}`, category === 'all' ? '全部' : category);
    button.type = 'button';
    button.dataset.category = category;
    button.setAttribute('aria-pressed', String(state.category === category));
    button.addEventListener('click', () => {
      state.category = category;
      renderCategories();
      renderApps();
    });
    els.chips.append(button);
  }
}

function renderApps() {
  const visible = filterApps(state.apps, { query: state.query, category: state.category });
  els.grid.replaceChildren();
  els.count.textContent = `${visible.length} ${visible.length === 1 ? 'TOOL' : 'TOOLS'}`;
  els.empty.hidden = visible.length > 0;
  els.grid.hidden = visible.length === 0;

  for (const app of visible) {
    const card = make('article', `app-card${app.featured ? ' featured' : ''}`);
    const iconWrap = make('div', 'app-icon-wrap');
    const icon = document.createElement('img');
    icon.alt = '';
    icon.loading = 'lazy';
    icon.src = app.iconPath ? appUrl(app.iconPath) : buildFallbackIconDataUri(app.name);
    icon.addEventListener('error', () => { icon.src = buildFallbackIconDataUri(app.name); }, { once: true });
    iconWrap.append(icon);

    const copy = make('div', 'app-card-copy');
    copy.append(make('h3', '', app.name || app.id));
    copy.append(make('p', '', app.description || 'Torsio Toletana Office Tool'));

    const footer = make('div', 'app-card-footer');
    const meta = make('div', 'app-meta');
    meta.append(make('span', '', app.category || 'Office'));
    meta.append(make('i'));
    meta.append(make('span', '', app.version ? `v${app.version}` : 'LIVE'));

    const open = make('a', 'open-app', '↗');
    open.href = appUrl(app.launchPath);
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.setAttribute('aria-label', `開啟 ${app.name || app.id}`);

    footer.append(meta, open);
    card.append(iconWrap, copy, footer);
    els.grid.append(card);
  }
}

async function loadCatalog() {
  els.loading.hidden = false;
  els.error.hidden = true;
  els.empty.hidden = true;
  try {
    const response = await fetch('./data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = normalizeCatalog(await response.json());
    state.apps = catalog.apps;
    renderCategories();
    renderApps();
  } catch (error) {
    els.errorMessage.textContent = `讀取 data/catalog.json 失敗：${error.message}`;
    els.error.hidden = false;
    els.grid.hidden = true;
    els.chips.replaceChildren();
  } finally {
    els.loading.hidden = true;
  }
}

els.search.addEventListener('input', (event) => {
  state.query = event.currentTarget.value;
  renderApps();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
  }
});

loadCatalog();
