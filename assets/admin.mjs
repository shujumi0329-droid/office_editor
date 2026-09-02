import { LOGO_DATA_URI } from './brand.mjs';
import {
  slugify,
  sanitizePackagePath,
  normalizeEntries,
  detectEntryPoint,
  buildFallbackIconDataUri,
  isPublisherReservedPath,
} from './package-utils.mjs';
import {
  normalizeCatalog,
  catalogRecordFromMeta,
  upsertCatalogApp,
  removeCatalogApp,
} from './catalog-utils.mjs';
import { createGitHubClient, bytesToBase64, textToBase64 } from './github-client.mjs';

const OWNER = 'shujumi0329-droid';
const REPO = 'office_editor';
const BRANCH = 'main';
const MAX_FILES = 300;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ICON_BYTES = 5 * 1024 * 1024;

for (const logo of document.querySelectorAll('[data-brand-logo]')) logo.src = LOGO_DATA_URI;

const els = Object.fromEntries([
  'auth-panel', 'token-input', 'unlock-button', 'auth-message', 'auth-status', 'publisher-workspace', 'lock-button',
  'drop-zone', 'file-input', 'folder-input', 'clear-package', 'package-inspector', 'file-count', 'package-size',
  'entry-label', 'entry-field', 'entry-select', 'file-preview', 'icon-input', 'icon-preview', 'clear-icon',
  'app-name', 'app-slug', 'app-description', 'app-category', 'app-version', 'app-featured', 'publish-button',
  'publish-progress', 'progress-bar', 'progress-label', 'existing-apps', 'refresh-apps', 'edit-badge', 'toast',
].map((id) => [id.replaceAll('-', '_'), document.getElementById(id)]));

const newAppButton = document.getElementById('new-app');

const state = {
  client: null,
  packageEntries: [],
  entry: null,
  sourceName: '',
  icon: null,
  iconMode: 'fallback',
  iconPreviewUrl: null,
  editing: null,
  catalog: { schemaVersion: 1, apps: [] },
  slugTouched: false,
  busy: false,
};

let toastTimer = null;

function showToast(message, type = '') {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast${type ? ` ${type}` : ''}`;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 4600);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function friendlyName(filename) {
  return String(filename || 'Office Tool')
    .replace(/\.(?:html?|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Office Tool';
}

function currentTotalBytes() {
  return state.packageEntries.reduce((sum, item) => sum + (item.bytes?.byteLength || 0), 0) + (state.icon?.bytes?.byteLength || 0);
}

function setBusy(busy) {
  state.busy = busy;
  els.publish_button.disabled = busy || !canPublish();
  els.unlock_button.disabled = busy;
  els.lock_button.disabled = busy;
}

function setProgress(percent, label) {
  els.publish_progress.hidden = false;
  els.progress_bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.progress_label.textContent = label;
}

function hideProgress() {
  els.publish_progress.hidden = true;
  els.progress_bar.style.width = '0%';
}

function canPublish() {
  if (!state.client || state.busy) return false;
  const name = els.app_name.value.trim();
  const slug = els.app_slug.value.trim();
  if (!name || !slug) return false;
  if (state.packageEntries.length) return Boolean(state.entry);
  return Boolean(state.editing);
}

function updatePublishState() {
  els.publish_button.disabled = !canPublish();
  els.publish_button.querySelector('span').textContent = state.editing ? '更新 Office Deck' : '發布到 Office Deck';
}

function releaseIconPreview() {
  if (state.iconPreviewUrl) URL.revokeObjectURL(state.iconPreviewUrl);
  state.iconPreviewUrl = null;
}

function refreshIconPreview() {
  releaseIconPreview();
  if (state.iconMode === 'custom' && state.icon?.file) {
    state.iconPreviewUrl = URL.createObjectURL(state.icon.file);
    els.icon_preview.src = state.iconPreviewUrl;
    return;
  }
  if (state.iconMode === 'keep' && state.editing?.iconPath) {
    els.icon_preview.src = new URL(`../${state.editing.iconPath}`, document.baseURI).href;
    return;
  }
  els.icon_preview.src = buildFallbackIconDataUri(els.app_name.value.trim() || 'TT');
}

function clearPackage() {
  state.packageEntries = [];
  state.entry = state.editing?.entry || null;
  state.sourceName = '';
  els.file_input.value = '';
  els.folder_input.value = '';
  els.package_inspector.hidden = true;
  els.file_preview.replaceChildren();
  els.entry_select.replaceChildren();
  els.entry_field.hidden = true;
  updatePublishState();
}

function resetForm() {
  clearPackage();
  state.editing = null;
  state.entry = null;
  state.slugTouched = false;
  state.icon = null;
  state.iconMode = 'fallback';
  releaseIconPreview();
  els.icon_input.value = '';
  els.app_name.value = '';
  els.app_slug.value = '';
  els.app_slug.disabled = false;
  els.app_description.value = '';
  els.app_category.value = 'Office';
  els.app_version.value = '1.0.0';
  els.app_featured.checked = false;
  els.edit_badge.hidden = true;
  refreshIconPreview();
  hideProgress();
  updatePublishState();
}

function renderPackage() {
  if (!state.packageEntries.length) {
    els.package_inspector.hidden = true;
    return;
  }
  const bytes = state.packageEntries.reduce((sum, item) => sum + item.bytes.byteLength, 0);
  els.package_inspector.hidden = false;
  els.file_count.textContent = String(state.packageEntries.length);
  els.package_size.textContent = formatBytes(bytes);
  els.entry_label.textContent = state.entry || '請選擇';
  els.file_preview.replaceChildren();

  for (const item of state.packageEntries.slice(0, 10)) {
    const row = document.createElement('div');
    row.className = 'file-row';
    const path = document.createElement('span');
    path.textContent = item.path;
    const size = document.createElement('span');
    size.textContent = formatBytes(item.bytes.byteLength);
    row.append(path, size);
    els.file_preview.append(row);
  }
  if (state.packageEntries.length > 10) {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.append(Object.assign(document.createElement('span'), { textContent: `…另外 ${state.packageEntries.length - 10} 個檔案` }));
    els.file_preview.append(row);
  }
  updatePublishState();
}

function validatePackageLimits(entries) {
  if (!entries.length) throw new Error('沒有找到可發布的檔案。');
  if (entries.length > MAX_FILES) throw new Error(`套件有 ${entries.length} 個檔案，超過 ${MAX_FILES} 個檔案限制。`);
  const total = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  if (total > MAX_BYTES) throw new Error(`套件大小 ${formatBytes(total)}，超過 20 MiB 限制。`);
}

function setPackage(rawEntries, suggestedName) {
  const entries = normalizeEntries(rawEntries);
  validatePackageLimits(entries);
  const detection = detectEntryPoint(entries.map((item) => item.path));
  if (!detection.candidates.length) throw new Error('套件內找不到 HTML 入口檔。');
  state.packageEntries = entries;
  state.sourceName = suggestedName;
  state.entry = detection.entry;

  els.entry_select.replaceChildren();
  if (detection.needsChoice) {
    els.entry_field.hidden = false;
    const placeholder = new Option('選擇要啟動的 HTML…', '');
    els.entry_select.add(placeholder);
    for (const candidate of detection.candidates) els.entry_select.add(new Option(candidate, candidate));
  } else {
    els.entry_field.hidden = true;
  }

  if (!state.editing) {
    const name = friendlyName(suggestedName);
    els.app_name.value = name;
    if (!state.slugTouched) els.app_slug.value = slugify(name);
    refreshIconPreview();
  }
  renderPackage();
  showToast(`已讀取 ${entries.length} 個檔案，${state.entry ? `入口為 ${state.entry}` : '請選擇入口 HTML'}。`, 'success');
}

async function fileEntries(files) {
  const entries = [];
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    entries.push({ path, bytes: new Uint8Array(await file.arrayBuffer()), file });
  }
  return entries;
}

async function readZip(file) {
  if (!window.JSZip) throw new Error('ZIP 元件尚未載入，請確認網路連線後重新整理。');
  const zip = await window.JSZip.loadAsync(file);
  const raw = [];
  for (const [path, item] of Object.entries(zip.files)) {
    if (item.dir) continue;
    raw.push({ path, bytes: await item.async('uint8array') });
    if (raw.length > MAX_FILES) throw new Error(`ZIP 超過 ${MAX_FILES} 個檔案限制。`);
  }
  setPackage(raw, file.name);
}

async function handleFiles(files) {
  const list = [...files];
  if (!list.length) return;
  try {
    if (list.length === 1 && /\.zip$/i.test(list[0].name)) {
      await readZip(list[0]);
      return;
    }
    const suggested = list[0].webkitRelativePath?.split('/')[0] || list[0].name;
    setPackage(await fileEntries(list), suggested);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function readFileSystemFile(entry, path) {
  return new Promise((resolve, reject) => {
    entry.file(async (file) => {
      try { resolve({ path, bytes: new Uint8Array(await file.arrayBuffer()), file }); }
      catch (error) { reject(error); }
    }, reject);
  });
}

function readDirectoryBatch(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkFileSystemEntry(entry, prefix = '') {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) return [await readFileSystemFile(entry, path)];
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const children = [];
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) break;
    children.push(...batch);
  }
  const output = [];
  for (const child of children) output.push(...await walkFileSystemEntry(child, path));
  return output;
}

async function handleDrop(dataTransfer) {
  try {
    const fsEntries = [...(dataTransfer.items || [])]
      .map((item) => item.kind === 'file' && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)
      .filter(Boolean);
    if (fsEntries.length) {
      const raw = [];
      for (const entry of fsEntries) raw.push(...await walkFileSystemEntry(entry));
      const suggested = fsEntries.length === 1 ? fsEntries[0].name : raw[0]?.path || 'Office Tool';
      if (raw.length === 1 && /\.zip$/i.test(raw[0].path) && raw[0].file) {
        await readZip(raw[0].file);
      } else {
        setPackage(raw, suggested);
      }
      return;
    }
    await handleFiles(dataTransfer.files);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function iconExtension(file) {
  const fromName = file.name.toLowerCase().match(/\.(png|jpe?g|webp|svg)$/)?.[1];
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName;
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' })[file.type] || null;
}

async function setCustomIcon(file) {
  try {
    const ext = iconExtension(file);
    if (!ext) throw new Error('圖示只接受 PNG、JPG、WebP 或 SVG。');
    if (file.size > MAX_ICON_BYTES) throw new Error('圖示大小不可超過 5 MiB。');
    state.icon = { file, ext, bytes: new Uint8Array(await file.arrayBuffer()) };
    state.iconMode = 'custom';
    if (currentTotalBytes() > MAX_BYTES) throw new Error('加入圖示後總套件超過 20 MiB。');
    refreshIconPreview();
    updatePublishState();
  } catch (error) {
    state.icon = null;
    state.iconMode = state.editing?.iconPath ? 'keep' : 'fallback';
    refreshIconPreview();
    showToast(error.message, 'error');
  }
}

async function unlock() {
  const token = els.token_input.value.trim();
  if (!token) {
    els.auth_message.textContent = '請貼上 Fine-grained GitHub Token。';
    return;
  }
  els.unlock_button.disabled = true;
  els.auth_message.textContent = '正在確認 repository 權限…';
  try {
    const client = createGitHubClient({ token, owner: OWNER, repo: REPO, branch: BRANCH });
    await client.validateToken();
    state.client = client;
    els.token_input.value = '';
    els.auth_panel.hidden = true;
    els.publisher_workspace.hidden = false;
    els.auth_status.innerHTML = '<span class="status-dot"></span>UNLOCKED';
    await loadCatalog();
    updatePublishState();
    showToast('Publisher 已解鎖。Token 只存在目前頁面記憶體。', 'success');
  } catch (error) {
    state.client = null;
    els.auth_message.textContent = `無法解鎖：${error.message}`;
    els.unlock_button.disabled = false;
  }
}

function lock() {
  if (state.busy) return;
  state.client = null;
  state.catalog = { schemaVersion: 1, apps: [] };
  resetForm();
  els.publisher_workspace.hidden = true;
  els.auth_panel.hidden = false;
  els.token_input.value = '';
  els.auth_message.textContent = `目標：${OWNER}/${REPO} · ${BRANCH}`;
  els.auth_status.innerHTML = '<span class="status-dot status-dot-warn"></span>LOCKED';
  els.token_input.focus();
}

function createExistingRow(app) {
  const row = document.createElement('div');
  row.className = 'existing-row';
  const icon = document.createElement('img');
  icon.alt = '';
  icon.src = app.iconPath ? new URL(`../${app.iconPath}`, document.baseURI).href : buildFallbackIconDataUri(app.name);
  icon.addEventListener('error', () => { icon.src = buildFallbackIconDataUri(app.name); }, { once: true });

  const copy = document.createElement('div');
  copy.className = 'existing-copy';
  const title = document.createElement('strong');
  title.textContent = app.name;
  const meta = document.createElement('span');
  meta.textContent = `${app.category || 'Office'} · ${app.version ? `v${app.version}` : 'LIVE'} · ${app.id}`;
  copy.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'existing-actions';
  const open = document.createElement('a');
  open.className = 'mini-button';
  open.href = new URL(`../${app.launchPath}`, document.baseURI).href;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = '開啟';
  const edit = document.createElement('button');
  edit.className = 'mini-button';
  edit.type = 'button';
  edit.textContent = '編輯';
  edit.addEventListener('click', () => loadExisting(app));
  const remove = document.createElement('button');
  remove.className = 'mini-button danger-button';
  remove.type = 'button';
  remove.textContent = '刪除';
  remove.addEventListener('click', () => deleteExisting(app));
  actions.append(open, edit, remove);
  row.append(icon, copy, actions);
  return row;
}

function renderExistingApps() {
  els.existing_apps.replaceChildren();
  if (!state.catalog.apps.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '目前沒有已發布工具。把第一個 HTML 拖到上面的 Package 區即可開始。';
    els.existing_apps.append(empty);
    return;
  }
  for (const app of state.catalog.apps) els.existing_apps.append(createExistingRow(app));
}

async function loadCatalog() {
  if (!state.client) return;
  els.existing_apps.innerHTML = '<p class="muted">讀取 catalog…</p>';
  try {
    state.catalog = normalizeCatalog(await state.client.fetchCatalog());
    renderExistingApps();
  } catch (error) {
    els.existing_apps.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = `Catalog 讀取失敗：${error.message}`;
    els.existing_apps.append(p);
  }
}

function loadExisting(app) {
  clearPackage();
  state.editing = app;
  state.slugTouched = true;
  state.entry = app.entry;
  state.icon = null;
  state.iconMode = app.iconPath ? 'keep' : 'fallback';
  els.icon_input.value = '';
  els.app_name.value = app.name || '';
  els.app_slug.value = app.id;
  els.app_slug.disabled = true;
  els.app_description.value = app.description || '';
  els.app_category.value = app.category || 'Office';
  els.app_version.value = app.version || '1.0.0';
  els.app_featured.checked = Boolean(app.featured);
  els.edit_badge.hidden = false;
  refreshIconPreview();
  updatePublishState();
  document.querySelector('.metadata-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function makeMetadata(slug, iconPath) {
  const now = new Date().toISOString();
  return {
    id: slug,
    name: els.app_name.value.trim(),
    description: els.app_description.value.trim(),
    category: els.app_category.value.trim() || 'Office',
    entry: state.packageEntries.length ? state.entry : state.editing.entry,
    icon: iconPath,
    version: els.app_version.value.trim() || '1.0.0',
    featured: els.app_featured.checked,
    publishedAt: state.editing?.publishedAt || now,
    updatedAt: now,
  };
}

async function uploadBlobs(items, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(6, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const sha = await state.client.createBlob(item.base64, 'base64');
      results[index] = { ...item, sha };
      completed += 1;
      onProgress?.(completed, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

function existingBlobPaths(tree, prefix) {
  return (tree.tree || [])
    .filter((item) => item.type === 'blob' && item.path.startsWith(prefix))
    .map((item) => item.path);
}

async function publish() {
  if (!canPublish()) return;
  const name = els.app_name.value.trim();
  const slug = state.editing ? state.editing.id : slugify(els.app_slug.value.trim() || name);
  els.app_slug.value = slug;
  if (!name) return showToast('請填寫工具名稱。', 'error');
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return showToast('Slug 只允許小寫英數字與連字號。', 'error');
  if (state.packageEntries.length && !state.entry) return showToast('請先選擇入口 HTML。', 'error');

  setBusy(true);
  setProgress(5, '讀取 main 最新版本…');
  try {
    const head = await state.client.getHead();
    const [freshCatalogRaw, tree] = await Promise.all([
      state.client.fetchCatalog(head.commitSha),
      state.client.getTree(head.treeSha, true),
    ]);
    let freshCatalog = normalizeCatalog(freshCatalogRaw);
    const prefix = `apps/${slug}/`;
    const writes = [];
    const intendedPaths = new Set();

    let iconPath = '';
    if (state.iconMode === 'custom' && state.icon) iconPath = `icon.${state.icon.ext}`;
    else if (state.iconMode === 'keep' && state.editing?.icon) iconPath = state.editing.icon;
    const reservedPackageIconPath = iconPath || (state.iconMode === 'fallback' ? (state.editing?.icon || '') : '');

    if (state.packageEntries.length) {
      for (const entry of state.packageEntries) {
        const safePath = sanitizePackagePath(entry.path);
        if (isPublisherReservedPath(safePath, reservedPackageIconPath)) continue;
        const repoPath = `${prefix}${safePath}`;
        intendedPaths.add(repoPath);
        writes.push({ path: repoPath, base64: bytesToBase64(entry.bytes) });
      }
    }

    if (state.iconMode === 'custom' && state.icon) {
      const repoPath = `${prefix}${iconPath}`;
      intendedPaths.add(repoPath);
      writes.push({ path: repoPath, base64: bytesToBase64(state.icon.bytes) });
    } else if (state.iconMode === 'keep' && state.editing?.icon) {
      intendedPaths.add(`${prefix}${iconPath}`);
    }

    const meta = makeMetadata(slug, iconPath);
    const metaPath = `${prefix}app.meta.json`;
    intendedPaths.add(metaPath);
    writes.push({ path: metaPath, base64: textToBase64(`${JSON.stringify(meta, null, 2)}\n`) });

    const record = catalogRecordFromMeta(meta, slug);
    freshCatalog = upsertCatalogApp(freshCatalog, record);
    writes.push({ path: 'data/catalog.json', base64: textToBase64(`${JSON.stringify(freshCatalog, null, 2)}\n`) });
    intendedPaths.add('data/catalog.json');

    const deletions = [];
    if (state.packageEntries.length) {
      for (const path of existingBlobPaths(tree, prefix)) {
        if (!intendedPaths.has(path)) deletions.push(path);
      }
    } else if (state.editing?.icon && state.iconMode !== 'keep') {
      const oldIcon = `${prefix}${state.editing.icon}`;
      if (!intendedPaths.has(oldIcon)) deletions.push(oldIcon);
    }

    setProgress(16, `建立 ${writes.length} 個 Git blobs…`);
    const blobs = await uploadBlobs(writes, (done, total) => {
      setProgress(16 + Math.round((done / total) * 58), `上傳 ${done} / ${total}…`);
    });

    const treeEntries = blobs.map((item) => ({ path: item.path, mode: '100644', type: 'blob', sha: item.sha }));
    for (const path of deletions) treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });

    setProgress(78, '建立 Git tree…');
    const newTreeSha = await state.client.createTree(head.treeSha, treeEntries);
    setProgress(86, '建立單一 commit…');
    const commitSha = await state.client.createCommit(`publish: ${meta.name}`, newTreeSha, head.commitSha);
    setProgress(94, '更新 main…');
    await state.client.updateRef(commitSha);
    setProgress(100, '發布完成');
    state.catalog = freshCatalog;
    renderExistingApps();
    showToast(`${meta.name} 已發布。GitHub Pages 稍後會更新。`, 'success');
    window.setTimeout(() => resetForm(), 900);
  } catch (error) {
    setProgress(0, '發布失敗');
    showToast(error.message.includes('422') ? 'main 在發布期間有新變更；請重新按一次發布。' : `發布失敗：${error.message}`, 'error');
    if (/401|403/.test(error.message)) lock();
  } finally {
    state.busy = false;
    updatePublishState();
  }
}

async function deleteExisting(app) {
  if (!state.client || state.busy) return;
  const confirmed = window.confirm(`確定要從 Office Deck 刪除「${app.name}」？\n\n這會刪除 apps/${app.id}/ 的公開檔案，但 Git 歷史仍保留舊版本。`);
  if (!confirmed) return;
  setBusy(true);
  setProgress(7, '準備刪除…');
  try {
    const head = await state.client.getHead();
    const [freshRaw, tree] = await Promise.all([
      state.client.fetchCatalog(head.commitSha),
      state.client.getTree(head.treeSha, true),
    ]);
    const prefix = `apps/${app.id}/`;
    const paths = existingBlobPaths(tree, prefix);
    const nextCatalog = removeCatalogApp(normalizeCatalog(freshRaw), app.id);
    const catalogSha = await state.client.createBlob(textToBase64(`${JSON.stringify(nextCatalog, null, 2)}\n`), 'base64');
    const entries = paths.map((path) => ({ path, mode: '100644', type: 'blob', sha: null }));
    entries.push({ path: 'data/catalog.json', mode: '100644', type: 'blob', sha: catalogSha });
    setProgress(55, `移除 ${paths.length} 個檔案…`);
    const treeSha = await state.client.createTree(head.treeSha, entries);
    const commitSha = await state.client.createCommit(`remove: ${app.name}`, treeSha, head.commitSha);
    setProgress(88, '更新 main…');
    await state.client.updateRef(commitSha);
    state.catalog = nextCatalog;
    renderExistingApps();
    if (state.editing?.id === app.id) resetForm();
    setProgress(100, '刪除完成');
    showToast(`${app.name} 已從甲板移除。`, 'success');
    window.setTimeout(hideProgress, 1000);
  } catch (error) {
    showToast(`刪除失敗：${error.message}`, 'error');
    if (/401|403/.test(error.message)) lock();
  } finally {
    state.busy = false;
    updatePublishState();
  }
}

els.unlock_button.addEventListener('click', unlock);
els.token_input.addEventListener('keydown', (event) => { if (event.key === 'Enter') unlock(); });
els.lock_button.addEventListener('click', lock);
els.file_input.addEventListener('change', (event) => handleFiles(event.currentTarget.files));
els.folder_input.addEventListener('change', (event) => handleFiles(event.currentTarget.files));
els.clear_package.addEventListener('click', clearPackage);
els.entry_select.addEventListener('change', (event) => {
  state.entry = event.currentTarget.value || null;
  els.entry_label.textContent = state.entry || '請選擇';
  updatePublishState();
});
els.icon_input.addEventListener('change', (event) => event.currentTarget.files[0] && setCustomIcon(event.currentTarget.files[0]));
els.clear_icon.addEventListener('click', () => {
  state.icon = null;
  state.iconMode = 'fallback';
  els.icon_input.value = '';
  refreshIconPreview();
  updatePublishState();
});
els.app_name.addEventListener('input', () => {
  if (!state.editing && !state.slugTouched) els.app_slug.value = slugify(els.app_name.value);
  if (state.iconMode === 'fallback') refreshIconPreview();
  updatePublishState();
});
els.app_slug.addEventListener('input', () => { state.slugTouched = true; updatePublishState(); });
els.app_slug.addEventListener('blur', () => {
  if (!state.editing && els.app_slug.value.trim()) els.app_slug.value = slugify(els.app_slug.value);
  updatePublishState();
});
for (const input of [els.app_description, els.app_category, els.app_version, els.app_featured]) input.addEventListener('input', updatePublishState);
els.publish_button.addEventListener('click', publish);
els.refresh_apps.addEventListener('click', loadCatalog);
if (newAppButton) newAppButton.addEventListener('click', resetForm);

for (const eventName of ['dragenter', 'dragover']) {
  els.drop_zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    els.drop_zone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  els.drop_zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.drop_zone.classList.remove('dragging');
  });
}
els.drop_zone.addEventListener('drop', (event) => handleDrop(event.dataTransfer));
els.drop_zone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    els.file_input.click();
  }
});

refreshIconPreview();
updatePublishState();
