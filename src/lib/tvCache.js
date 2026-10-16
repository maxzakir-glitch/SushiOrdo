import { normalizeStore } from './store.js';
import { APP_ID } from './config.js';
const key = APP_ID + ':published-tv-cache';
export function loadTvStore() {
  try { const cached = JSON.parse(localStorage.getItem(key)); if (cached?.appId === APP_ID) return normalizeStore(cached.data); } catch { /* no cached publication */ }
  return { screens: [] };
}
export function cacheTvStore(data) {
  try { localStorage.setItem(key, JSON.stringify({ appId: APP_ID, data })); } catch { /* TV can run without an offline cache */ }
}
