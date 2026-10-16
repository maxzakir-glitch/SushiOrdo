import { useEffect, useRef, useState } from 'react';
import { loadStore, cacheStore, normalizeStore } from './store.js';
import { fetchCloud, pushCloud, hasToken, checkToken, getToken, setToken } from './cloud.js';
import { loadDraft, saveDraft } from './drafts.js';

export default function useEditor() {
  const [store, renderStore] = useState(loadStore);
  const [cloud, setCloud] = useState({ s: 'check' });
  const [cloudNewer, setCloudNewer] = useState('');
  const [connectMsg, setConnectMsg] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [ready, setReady] = useState(false);
  const state = useRef({ data: store, dirty: false, baseRevision: null, edit: 0, ready: false });
  const init = useRef(null), timer = useRef(null), sending = useRef(null), pending = useRef(false);
  const writes = useRef(Promise.resolve()), mounted = useRef(false);
  const [localError, setLocalError] = useState('');
  const error = e => String(e?.message || e);
  function persist() {
    const snapshot = structuredClone(state.current);
    writes.current = writes.current.catch(() => {}).then(() => saveDraft(snapshot));
    writes.current.then(() => setLocalError(''), e => setLocalError('Черновик не сохранён на устройстве: ' + error(e) + '. Не закрывайте страницу; экспортируйте JSON.'));
    return writes.current;
  }
  function accept(remote) {
    Object.assign(state.current, { data: remote.data, baseRevision: remote.revision, dirty: false });
    renderStore(remote.data); cacheStore(remote.data, Date.parse(remote.updatedAt) || 0);
    setCloudNewer(''); setCloud({ s: 'ok', at: remote.updatedAt });
    return persist();
  }
  async function initialSync() {
    if (init.current) return init.current;
    init.current = (async () => {
      try {
        const draft = await loadDraft();
        if (draft?.data?.screens) { Object.assign(state.current, draft, { ready: false }); renderStore(draft.data); }
        const remote = await fetchCloud();
        if (state.current.dirty) {
          if (state.current.baseRevision !== remote.revision) { setCloudNewer(remote.updatedAt); setCloud({ s: 'err', msg: 'Восстановлен неопубликованный черновик. Облачная версия отличается — экспортируйте черновик перед загрузкой облачной версии.' }); }
          else { setCloud({ s: hasToken() ? 'queued' : 'no' }); if (hasToken()) timer.current = setTimeout(doPush, 1500); }
        } else await accept(remote);
      } catch (e) { setCloud({ s: 'err', msg: error(e) }); }
      finally { state.current.ready = true; setReady(true); }
    })();
    return init.current;
  }
  function setStore(updater) {
    if (!state.current.ready) return;
    const data = normalizeStore(typeof updater === 'function' ? updater(state.current.data) : updater);
    Object.assign(state.current, { data, dirty: true, edit: state.current.edit + 1 });
    renderStore(data); cacheStore(data, Date.now()); persist();
    clearTimeout(timer.current);
    setCloud({ s: hasToken() ? 'queued' : 'no' });
    if (hasToken()) timer.current = setTimeout(doPush, 4000);
  }
  async function doPush() {
    clearTimeout(timer.current);
    await initialSync();
    if (!hasToken()) { setCloud({ s: 'no' }); setConnectMsg('Введите GitHub-токен с Contents: Read and write только для SushiOrdo. Токен не нужен телевизорам.'); return; }
    if (sending.current) { pending.current = true; return sending.current; }
    sending.current = (async () => {
      try {
        await writes.current;
        const snapshot = structuredClone(state.current);
        if (!snapshot.baseRevision) throw new Error('Не удалось прочитать текущую версию облака. Нажмите «Обновить данные» перед публикацией. Черновик не удаляется.');
        setCloud({ s: 'push' });
        const result = await pushCloud(snapshot.data, snapshot.baseRevision);
        state.current.baseRevision = result.revision;
        if (state.current.edit === snapshot.edit) { state.current.dirty = false; state.current.data = result.data; renderStore(result.data); }
        await persist();
        setCloud({ s: state.current.dirty ? 'queued' : 'ok', at: result.updatedAt });
        setConnectMsg('✓ Записано в SushiOrdo. ТВ проверяют новую версию каждые 10 секунд; сеть/CDN могут добавить задержку.');
        if (state.current.dirty) pending.current = true;
      } catch (e) {
        pending.current = false;
        setCloud({ s: 'err', msg: error(e) });
        if (e.conflict || e.status === 409 || e.status === 422) setCloudNewer(new Date().toISOString());
      } finally {
        sending.current = null;
        if (pending.current && mounted.current) { pending.current = false; timer.current = setTimeout(doPush, 500); }
      }
    })();
    return sending.current;
  }
  async function manualPull() {
    if (!state.current.ready) return;
    await initialSync();
    if (sending.current) { setConnectMsg('Дождитесь окончания публикации.'); return; }
    if (state.current.dirty && !confirm('Есть неопубликованный черновик. Экспортируйте JSON, если он нужен. Заменить его облачной версией?')) return;
    const edit = state.current.edit;
    clearTimeout(timer.current); setCloud({ s: 'check' });
    try {
      const remote = await fetchCloud();
      if (state.current.edit !== edit) throw new Error('Пока загружались данные, вы внесли правки. Они сохранены; повторите загрузку при необходимости.');
      await accept(remote);
    } catch (e) { setCloud({ s: 'err', msg: error(e) }); }
  }
  async function connectToken() {
    setConnectMsg('Проверяю доступ к SushiOrdo…');
    try {
      const login = await checkToken(tokenInput.trim());
      setToken(tokenInput); setTokenInput('');
      const remote = await fetchCloud();
      if (!state.current.dirty) await accept(remote);
      else if (remote.revision !== state.current.baseRevision) { setCloudNewer(remote.updatedAt); throw new Error('Токен подключён, но облачная версия отличается. Экспортируйте черновик и загрузите облачную версию.'); }
      setConnectMsg('✓ Подключён ' + login + '. Доступ записи проверяется при публикации.');
      setCloud({ s: state.current.dirty ? 'queued' : 'ok', at: remote.updatedAt });
      if (state.current.dirty) await doPush();
    } catch (e) { setConnectMsg('✗ ' + error(e)); setCloud({ s: 'err', msg: error(e) }); }
  }
  async function testConnection() {
    try { const login = await checkToken(getToken()); setConnectMsg('✓ Доступ чтения: ' + login + '. Доступ записи проверяется при сохранении.'); }
    catch (e) { setConnectMsg('✗ ' + error(e)); }
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify(state.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `SushiOrdo-backup-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false, release;
    const lockController = new AbortController();
    const lockWarning = setTimeout(() => { if (!state.current.ready) setLocalError('Редактор уже открыт в другой вкладке. Закройте её, чтобы продолжить здесь.'); }, 1500);
    const start = async () => { if (!cancelled) await initialSync(); };
    if (navigator.locks) {
      navigator.locks.request('sushi-ordo-v2:editor', { mode: 'exclusive', signal: lockController.signal }, async lock => {
        if (cancelled) return;
        clearTimeout(lockWarning); setLocalError('');
        const held = new Promise(resolve => { release = resolve; });
        await start();
        if (!cancelled) await held;
      }).catch(e => { if (e.name !== 'AbortError') setLocalError(error(e)); });
    } else start();
    const warn = e => { if (state.current.dirty || sending.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { cancelled = true; clearTimeout(lockWarning); lockController.abort(); release?.(); mounted.current = false; clearTimeout(timer.current); window.removeEventListener('beforeunload', warn); };
  }, []);
  return { store, setStore, cloud, setCloud, cloudNewer, setCloudNewer, connectMsg, setConnectMsg, tokenInput, setTokenInput, ready, localError, doPush, manualPull, connectToken, testConnection, exportDraft };
}
