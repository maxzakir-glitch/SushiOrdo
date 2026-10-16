import { APP_ID } from './config.js';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_ID, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction(mode, value) {
  const conn = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = conn.transaction('drafts', mode); const store = tx.objectStore('drafts');
      const req = mode === 'readonly' ? store.get('editor') : store.put(value, 'editor');
      tx.oncomplete = () => resolve(mode === 'readonly' ? req.result : undefined);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить черновик'));
    });
  } finally { conn.close(); }
}
export function loadDraft() { return transaction('readonly'); }
export function saveDraft(value) { return transaction('readwrite', value); }
