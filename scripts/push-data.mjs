// Публикация данных и картинок в облако: коммитит папку (по умолчанию out/) в ветку gh-pages.
// Использование: node scripts/push-data.mjs <папка> [путь-в-репо]
//   папка содержит menu.json и/или img/*.jpg → репо: data/menu.json, data/img/*.jpg
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'maxzakir-glitch/SushiOrdo';
const BRANCH = 'gh-pages';
const API = `https://api.github.com/repos/${REPO}`;

const localDir = process.argv[2];
const repoPrefix = (process.argv[3] || 'data').replace(/\/+$/, '');
if (!localDir || !fs.existsSync(localDir)) { console.error('укажи папку'); process.exit(1); }

const token = process.env.GH_TOKEN || '';
if (!token) { console.error('нет GH_TOKEN'); process.exit(1); }

function b64(buf) { return buf.toString('base64'); }

async function gh(p, method = 'GET', body) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `GitHub ${res.status}`;
    try { msg += `: ${(await res.json()).message}`; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// собрать список файлов (рекурсивно)
function walk(dir, base = '') {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const rel = base ? `${base}/${f}` : f;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

const files = walk(localDir);
console.log(`файлов к публикации: ${files.length}`);

const ref = await gh(`/git/ref/heads/${BRANCH}`);
const headCommit = await gh(`/git/commits/${ref.object.sha}`);
const baseTree = headCommit.tree.sha;

const tree = [];
let done = 0;
for (const f of files) {
  const blob = await gh('/git/blobs', 'POST', { content: b64(fs.readFileSync(f.full)), encoding: 'base64' });
  tree.push({ path: `${repoPrefix}/${f.rel.replace(/\\/g, '/')}`, mode: '100644', type: 'blob', sha: blob.sha });
  done++;
  if (done % 10 === 0) console.log(`загружено ${done}/${files.length}`);
}

const newTree = await gh('/git/trees', 'POST', { base_tree: baseTree, tree });
const commit = await gh('/git/commits', 'POST', {
  message: `data update ${new Date().toISOString()}`,
  tree: newTree.sha,
  parents: [ref.object.sha],
});
await gh(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha });
console.log('опубликовано, коммит:', commit.sha.slice(0, 8));
