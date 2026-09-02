import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGitHubClient,
  bytesToBase64,
  textToBase64,
  decodeBase64Utf8,
} from '../assets/github-client.mjs';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('base64 helpers round-trip UTF-8 and binary payloads', () => {
  const text = 'Torsio 工具';
  assert.equal(decodeBase64Utf8(textToBase64(text)), text);
  assert.equal(bytesToBase64(new Uint8Array([0, 1, 254, 255])), 'AAH+/w==');
});

test('client sends memory token as authorization header and targets configured repo', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return response(200, { permissions: { push: true } });
  };
  const client = createGitHubClient({ token: 'github_pat_example', owner: 'shujumi0329-droid', repo: 'office_editor', fetchImpl: fakeFetch });
  await client.validateToken();
  assert.equal(calls[0].url, 'https://api.github.com/repos/shujumi0329-droid/office_editor');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer github_pat_example');
});

test('getHead resolves ref then commit tree', async () => {
  const fakeFetch = async (url) => {
    if (url.endsWith('/git/ref/heads/main')) return response(200, { object: { sha: 'commit1' } });
    if (url.endsWith('/git/commits/commit1')) return response(200, { sha: 'commit1', tree: { sha: 'tree1' } });
    throw new Error(`unexpected ${url}`);
  };
  const client = createGitHubClient({ token: 'x', owner: 'o', repo: 'r', fetchImpl: fakeFetch });
  assert.deepEqual(await client.getHead(), { commitSha: 'commit1', treeSha: 'tree1' });
});

test('fetchCatalog returns an empty catalog when file does not exist', async () => {
  const fakeFetch = async () => response(404, { message: 'Not Found' });
  const client = createGitHubClient({ token: 'x', owner: 'o', repo: 'r', fetchImpl: fakeFetch });
  assert.deepEqual(await client.fetchCatalog(), { schemaVersion: 1, apps: [] });
});

test('createTree and updateRef send Git data API payloads', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/git/trees')) return response(201, { sha: 'tree2' });
    if (url.endsWith('/git/refs/heads/main')) return response(200, { object: { sha: 'commit2' } });
    throw new Error(`unexpected ${url}`);
  };
  const client = createGitHubClient({ token: 'x', owner: 'o', repo: 'r', fetchImpl: fakeFetch });
  assert.equal(await client.createTree('tree1', [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'blob1' }]), 'tree2');
  await client.updateRef('commit2');
  assert.deepEqual(JSON.parse(calls[0].options.body), { base_tree: 'tree1', tree: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'blob1' }] });
  assert.deepEqual(JSON.parse(calls[1].options.body), { sha: 'commit2', force: false });
});

test('GitHub API errors include status and message', async () => {
  const fakeFetch = async () => response(403, { message: 'Resource not accessible by personal access token' });
  const client = createGitHubClient({ token: 'bad', owner: 'o', repo: 'r', fetchImpl: fakeFetch });
  await assert.rejects(() => client.validateToken(), /403.*Resource not accessible/);
});

test('fetchCatalog can pin reads to a specific commit for atomic updates', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return response(200, { content: textToBase64(JSON.stringify({ schemaVersion: 1, apps: [] })) });
  };
  const client = createGitHubClient({ token: 'x', owner: 'o', repo: 'r', branch: 'main', fetchImpl: fakeFetch });
  await client.fetchCatalog('commit1');
  assert.match(calls[0], /\?ref=commit1$/);
});
