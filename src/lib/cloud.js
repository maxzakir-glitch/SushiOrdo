import { normalizeStore } from './store.js';
import { APP_ID, REPO, DATA_BRANCH, RAW_BASE, TOKEN_KEY } from './config.js';
export { TOKEN_KEY } from './config.js';
const API = `https://api.github.com/repos/${REPO}`;
const MENU = 'data/menu.json';
export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function normalizeTokenInput(raw) { return String(raw || '').trim(); }
export function setToken(raw) {
  const token = normalizeTokenInput(raw);
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
}
export function hasToken() { return Boolean(getToken()); }
export function cloudFileUrl() { return `${RAW_BASE}${MENU}`; }
async function request(url, { token = getToken(), ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    if (!res.ok) {
      const error = new Error(`GitHub ${res.status}: ${res.status === 401 ? 'неверный или истёкший токен' : res.status === 403 ? 'нет разрешения или превышен лимит' : res.status === 409 || res.status === 422 ? 'конфликт версий — заберите свежие данные' : 'запрос не выполнен'}`);
      error.status = res.status; throw error;
    }
    return res.status === 204 ? null : res.json();
  } finally { clearTimeout(timer); }
}
function decode64(text) { return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0))); }
function encode64(bytes) {
  let value = ''; for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(value);
}
function validate(envelope) {
  if (envelope?.appId !== APP_ID || !envelope.revision || !Array.isArray(envelope.data?.screens)) throw new Error('Неверный файл меню: данные не принадлежат SushiOrdo. Старое кафе не подключается.');
  return { ...envelope, data: normalizeStore(envelope.data) };
}
async function readPrivate() {
  let file;
  try { file = await request(`${API}/contents/${MENU}?ref=${DATA_BRANCH}&t=${Date.now()}`); }
  catch (e) { if (e.status === 404) throw new Error('Ветка данных не подготовлена. Дождитесь первого успешного запуска Setup and deploy в GitHub Actions.'); throw e; }
  if (!file.content) throw new Error('Файл меню слишком большой. Загружайте фото отдельными файлами через редактор.');
  return { ...validate(JSON.parse(decode64(file.content))), sha: file.sha };
}
export async function checkToken(candidate = getToken()) {
  const user = await request('https://api.github.com/user', { token: candidate });
  await request(`${API}/contents/${MENU}?ref=${DATA_BRANCH}`, { token: candidate });
  return user.login;
}
export async function fetchCloud(timeoutMs = 15000, _bust = true, authenticated = hasToken()) {
  if (authenticated) return readPrivate();
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cloudFileUrl()}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`Меню недоступно (${res.status}). Проверьте интернет и первый запуск GitHub Actions.`);
    return validate(await res.json());
  } finally { clearTimeout(timer); }
}
export async function pushCloud(data, expectedRevision) {
  if (!hasToken()) throw new Error('Сначала подключите GitHub-токен для SushiOrdo.');
  const previous = await readPrivate();
  if (previous.revision !== expectedRevision) { const e = new Error('В облаке другая версия. Ваш черновик сохранён. Сначала заберите данные из облака или экспортируйте свой черновик.'); e.conflict = true; throw e; }
  const payload = normalizeStore(data);
  // Offline drafts may contain inline photos. Move them out of menu.json before publishing.
  for (const screen of payload.screens) for (const slide of screen.slides) {
    if (slide.bg?.startsWith('data:image/')) {
      const blob = await (await fetch(slide.bg)).blob();
      slide.bg = await uploadRepoFile(new File([blob], 'photo.jpg', { type: blob.type }));
    }
  }
  const envelope = { appId: APP_ID, revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), data: payload };
  try {
    await request(`${API}/contents/${MENU}`, { method: 'PUT', body: JSON.stringify({ branch: DATA_BRANCH, sha: previous.sha,
      message: `SushiOrdo menu ${envelope.updatedAt}`, content: encode64(new TextEncoder().encode(JSON.stringify(envelope))) }) });
  } catch (error) {
    // A timed-out write may already have committed. Never blindly submit it again.
    try { const actual = await readPrivate(); if (actual.revision === envelope.revision) return actual; } catch { /* preserve original error */ }
    throw error;
  }
  return envelope;
}
export async function uploadRepoFile(file) {
  if (!hasToken()) throw new Error('Для загрузки медиа сначала подключите GitHub.');
  if (file.size > 45 * 1024 * 1024) throw new Error('Максимум 45 МБ. Сожмите видео до MP4 H.264.');
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'video/webm' ? 'webm' : file.type === 'video/mp4' ? 'mp4' : null;
  if (!ext) throw new Error('Поддерживаются JPG, PNG, WebP, MP4 и WebM.');
  const path = `data/media/${crypto.randomUUID()}.${ext}`;
  await request(`${API}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ branch: DATA_BRANCH, message: `SushiOrdo media ${ext}`, content: encode64(new Uint8Array(await file.arrayBuffer())) }) });
  return `${RAW_BASE}${path}`;
}
