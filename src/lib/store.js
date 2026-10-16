// Simple localStorage store - easily swappable to Supabase/Firebase later
import { STORE_KEY, PLACEHOLDER } from './config.js';
const KEY = STORE_KEY;
const OLD_KEYS = []; // Never migrate data from the original cafe.

function uid() { return Math.random().toString(36).slice(2, 9); }

function defaultStyle() {
  return {
    bg: '#ffffff',
    bgOpacity: 0.82,
    blur: 14,
    radius: 20,
    borderOpacity: 0.5,
    shadow: true,
    textColor: '#18181b',
    priceBg: '#18181b',
    priceColor: '#ffffff',
  };
}

function normalizeItem(raw, i) {
  const cols = [46, 30, 32];
  const rawW = typeof raw.w === 'number' ? raw.w : raw.w ? Number(raw.w) : cols[i % cols.length];
  // clamp width to prevent old huge values from breaking layout
  const w = Math.max(12, Math.min(88, rawW));
  return {
    id: raw.id || uid(),
    title: raw.title || raw.name || 'Блюдо',
    desc: raw.desc || raw.subtitle || '',
    weight: raw.weight || raw.gram || raw.grams || raw.gramm || '',
    price: raw.price ?? '',
    x: typeof raw.x === 'number' ? Math.max(0, Math.min(100 - w, raw.x)) : (i === 0 ? 6 : i === 1 ? 52 : 10 + i * 30) % 60,
    y: typeof raw.y === 'number' ? raw.y : 68,
    w,
    style: { ...defaultStyle(), ...(raw.style || {}) },
  };
}

const RAW_DEFAULT = { screens: Array.from({ length: 6 }, (_, i) => ({ id: 'tv' + (i + 1), name: 'Суши ORDO — ТВ ' + (i + 1), slides: [{ id: 'ordo-slide-' + (i + 1), type: 'image', bg: PLACEHOLDER, duration: 10, transition: 'fade', items: [] }] })) };

export function normalizeStore(raw) {
  if (!raw || !raw.screens) return normalizeStore(RAW_DEFAULT);
  const screens = raw.screens.map((sc) => ({
    id: sc.id,
    name: sc.name,
    slides: (sc.slides || []).map((sl) => ({
      id: sl.id,
      type: sl.type || 'image',
      bg: sl.bg,
      duration: sl.duration || 7,
      transition: sl.transition || 'fade',
      items: (sl.items || []).map((it, idx) => normalizeItem(it, idx)),
    })),
  }));
  return { screens };
}

const DEFAULT = normalizeStore(RAW_DEFAULT);
export function loadStore() {
  try {
    let raw = localStorage.getItem(KEY);
    // one-time migration: if v3 empty but old key exists, migrate
    if (!raw) {
      for (const k of OLD_KEYS) {
        const old = localStorage.getItem(k);
        if (old) { raw = old; break; }
      }
      if (!raw) return structuredClone(DEFAULT);
      const parsed = JSON.parse(raw);
      const migrated = normalizeStore(parsed);
      // persist migrated immediately
      try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch {}
      return migrated;
    }
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch { return structuredClone(DEFAULT); }
}

export function wipeOldKeys() {
  for (const k of OLD_KEYS) try { localStorage.removeItem(k); localStorage.removeItem(k + '_ts'); } catch {}
}

export function saveStore(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  localStorage.setItem(KEY + '_ts', Date.now().toString());
}

// время последней правки на этом устройстве (0 = здесь не редактировали)
export function localTs() {
  try { return Number(localStorage.getItem(KEY + '_ts') || 0); } catch { return 0; }
}

// записать данные в кэш, не помечая их как «свежая правка» (приходит из облака)
export function cacheStore(data, ts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    localStorage.setItem(KEY + '_ts', String(ts || 0));
  } catch {}
}

// чистим только данные меню — токен облака и другой localStorage не трогаем
export function clearMenuKeys() {
  for (const k of [...OLD_KEYS, KEY]) {
    try { localStorage.removeItem(k); localStorage.removeItem(k + '_ts'); } catch {}
  }
}

export function resetStore() {
  const d = structuredClone(DEFAULT);
  saveStore(d);
  return d;
}

export function createEmptyItem() {
  return normalizeItem({ title: 'Новое блюдо', desc: '', price: '', x: 30, y: 36, w: 36 }, 0);
}

export function makeId() { return uid(); }

export const TRANSITIONS = [
  { id: 'fade', label: 'Fade + Scale (дорого)' },
  { id: 'slide', label: 'Slide влево' },
  { id: 'zoom', label: 'Zoom + Blur' },
  { id: 'blinds', label: 'Жалюзи' },
  { id: 'cube', label: '3D Cube' },
  { id: 'pixel', label: 'Pixelate' },
  { id: 'displacement', label: 'Displacement (GL Warp)' },
];

export const DEFAULT_STYLE = defaultStyle();

export function hexToRgba(hex, opacity = 1) {
  try {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  } catch { return `rgba(255,255,255,${opacity})`; }
}
