const API_ROOT = 'https://api.github.com';

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(String(text)));
}

export function decodeBase64Utf8(base64) {
  const cleaned = String(base64).replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createGitHubClient({ token, owner, repo, branch = 'main', fetchImpl = fetch }) {
  if (!token) throw new Error('缺少 GitHub Token。');
  const repoBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  async function request(path, { method = 'GET', body, allow404 = false } = {}) {
    const response = await fetchImpl(`${API_ROOT}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = payload?.message || '';
      } catch {
        detail = await response.text();
      }
      throw new Error(`GitHub API ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    async validateToken() {
      const repository = await request(repoBase);
      if (repository?.permissions && repository.permissions.push === false) {
        throw new Error('GitHub Token 沒有此 repository 的寫入權限。');
      }
      return repository;
    },

    async getHead() {
      const ref = await request(`${repoBase}/git/ref/heads/${encodeURIComponent(branch)}`);
      const commitSha = ref.object.sha;
      const commit = await request(`${repoBase}/git/commits/${commitSha}`);
      return { commitSha, treeSha: commit.tree.sha };
    },

    async getTree(treeSha, recursive = false) {
      return request(`${repoBase}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`);
    },

    async fetchCatalog(ref = branch) {
      const file = await request(`${repoBase}/contents/data/catalog.json?ref=${encodeURIComponent(ref)}`, { allow404: true });
      if (!file) return { schemaVersion: 1, apps: [] };
      try {
        const parsed = JSON.parse(decodeBase64Utf8(file.content));
        return parsed && Array.isArray(parsed.apps) ? parsed : { schemaVersion: 1, apps: [] };
      } catch {
        throw new Error('Repository 的 data/catalog.json 不是有效 JSON。');
      }
    },

    async createBlob(content, encoding = 'base64') {
      const result = await request(`${repoBase}/git/blobs`, { method: 'POST', body: { content, encoding } });
      return result.sha;
    },

    async createTree(baseTree, tree) {
      const result = await request(`${repoBase}/git/trees`, { method: 'POST', body: { base_tree: baseTree, tree } });
      return result.sha;
    },

    async createCommit(message, treeSha, parentSha) {
      const result = await request(`${repoBase}/git/commits`, {
        method: 'POST',
        body: { message, tree: treeSha, parents: [parentSha] },
      });
      return result.sha;
    },

    async updateRef(commitSha) {
      return request(`${repoBase}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: 'PATCH',
        body: { sha: commitSha, force: false },
      });
    },
  };
}
