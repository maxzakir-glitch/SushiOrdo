import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TRANSITIONS, createEmptyItem, hexToRgba } from '../lib/store';
import { uploadRepoFile, setToken, hasToken } from '../lib/cloud';
import CanvasStage from '../components/CanvasStage';
import useEditor from '../lib/useEditor';
import { PLACEHOLDER } from '../lib/config';

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export default function Admin() {
  const { store, setStore, cloud, setCloud, cloudNewer, setCloudNewer, connectMsg, setConnectMsg, tokenInput, setTokenInput, ready, localError, doPush, manualPull, connectToken, testConnection, exportDraft } = useEditor();
  const [activeScreenId, setActiveScreenId] = useState('tv1');
  const [activeSlideId, setActiveSlideId] = useState('ordo-slide-1');
  const [selectedId, setSelectedId] = useState(null);
  const [showCloudPanel, setShowCloudPanel] = useState(false);
  useEffect(() => {
    if (!showCloudPanel) return;
    document.getElementById('publish-token')?.focus();
    const close = e => { if (e.key === 'Escape') setShowCloudPanel(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [showCloudPanel]);
  async function saveToTv() {
    if (!hasToken()) { setShowCloudPanel(true); return; }
    await doPush();
  }
  useEffect(() => {
    const sc = store.screens.find(s => s.id === activeScreenId) || store.screens[0];
    if (!sc) return;
    if (sc.id !== activeScreenId) setActiveScreenId(sc.id);
    if (!sc.slides.some(s => s.id === activeSlideId)) setActiveSlideId(sc.slides[0]?.id);
  }, [store, activeScreenId, activeSlideId]);
  const screen = store.screens.find((s) => s.id === activeScreenId);
  const slide = screen?.slides.find((s) => s.id === activeSlideId);
  const selected = slide?.items.find((x) => x.id === selectedId) || null;

  // keep selection in sync when switching
  useEffect(() => {
    if (!slide) return;
    if (!selectedId || !slide.items.find((x) => x.id === selectedId)) {
      setSelectedId(slide.items[0]?.id || null);
    }
  }, [activeSlideId, slide, selectedId]);

  function updateStore(fn) {
    setStore((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function patchItem(itemId, patch) {
    updateStore((d) => {
      const it = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).items.find((x) => x.id === itemId);
      Object.assign(it, patch);
    });
  }
  function patchStyle(itemId, patch) {
    updateStore((d) => {
      const it = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).items.find((x) => x.id === itemId);
      it.style = { ...it.style, ...patch };
    });
  }

  // style clipboard
  const [copiedStyle, setCopiedStyle] = useState(null);
  function copyStyleFromSelected() {
    if (!selected) return;
    setCopiedStyle(structuredClone(selected.style));
  }
  function pasteStyleToSelected() {
    if (!selected || !copiedStyle) return;
    patchStyle(selected.id, structuredClone(copiedStyle));
  }
  function applyStyleToAllOnSlide() {
    if (!selected || !slide) return;
    const style = structuredClone(selected.style);
    updateStore((d) => {
      const sl = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId);
      sl.items.forEach((it) => { it.style = structuredClone(style); });
    });
  }
  function applyStyleToAllEverywhere() {
    if (!selected) return;
    const style = structuredClone(selected.style);
    updateStore((d) => {
      d.screens.forEach((sc) => sc.slides.forEach((sl) => sl.items.forEach((it) => { it.style = structuredClone(style); })));
    });
  }

  // image upload: compress to 1920w JPEG dataURL and put into slide.bg
  const fileInputRef = React.useRef(null);
  function fileToDataUrl(file, maxW = 1920, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку')); };
      img.src = url;
    });
  }
  // video upload: файл целиком уезжает в облако (data/video/...), bg становится путём
  const videoInputRef = React.useRef(null);
  const [videoUploading, setVideoUploading] = useState(false);
  async function onPickVideo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) { alert('Выбери видеофайл MP4 (H.264)'); e.target.value = ''; return; }
    if (f.size > 45 * 1024 * 1024) { alert('Файл больше 45 МБ. Сожми видео (MP4, H.264, 1080p) или возьми покороче.'); e.target.value = ''; return; }
    if (!hasToken()) { alert('Сначала подключи облако (блок «☁ Облако» слева внизу) — видео грузится прямо в облако.'); setShowCloudPanel(true); e.target.value = ''; return; }
    if (!confirm(`Загрузить видео (${Math.round(f.size / 1024 / 1024)} МБ) в облако? Это займёт 1-3 минуты — не закрывай страницу.`)) { e.target.value = ''; return; }
    setVideoUploading(true);
    try {
      const url = await uploadRepoFile(f);
      updateStore((d) => {
        const sl = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId);
        sl.type = 'video';
        sl.bg = url;
      });
    } catch (err) {
      alert('Не удалось загрузить видео: ' + (err.message || err) + '. Проверь связь и попробуй ещё раз.');
    } finally {
      setVideoUploading(false);
      e.target.value = '';
    }
  }

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Выбери картинку JPG/PNG/WebP'); e.target.value = ''; return; }
    if (f.size > 12 * 1024 * 1024) { alert('Файл слишком большой (>12MB). Сожми фото.'); e.target.value = ''; return; }
    try {
      let dataUrl = await fileToDataUrl(f, 1920, 0.82);
      if (hasToken()) {
        const blob = await (await fetch(dataUrl)).blob();
        dataUrl = await uploadRepoFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      }
      // check localStorage size: dataURL ~ 300-600KB for 1920 JPG 0.82
      updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).bg = dataUrl; });
    } catch (err) { alert(err.message || String(err)); }
    finally { e.target.value = ''; }
  }

  const cloudChip = (() => {
    const base = 'text-[11px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap cursor-pointer';
    switch (cloud.s) {
      case 'ok': return <span onClick={() => setShowCloudPanel(true)} className={`${base} bg-emerald-600/20 text-emerald-300 border border-emerald-600/40`}>☁ в облаке {fmtTime(cloud.at)}</span>;
      case 'push': return <span className={`${base} bg-sky-600/20 text-sky-300 border border-sky-600/40 animate-pulse`}>☁ публикую…</span>;
      case 'queued': return <span className={`${base} bg-sky-600/20 text-sky-300 border border-sky-600/40`}>☁ скоро опубликую</span>;
      case 'check': return <span className={`${base} bg-zinc-700/40 text-zinc-300 border border-zinc-600`}>☁ проверяю…</span>;
      case 'err': return <span onClick={() => setShowCloudPanel(true)} className={`${base} bg-red-600/20 text-red-300 border border-red-600/40`}>☁ ошибка: {cloud.msg || 'нет связи'}</span>;
      default: return <span onClick={() => setShowCloudPanel(true)} className={`${base} bg-amber-600/20 text-amber-300 border border-amber-600/40`}>☁ не подключено</span>;
    }
  })();

  return (
    <div className="min-h-screen bg-[#0f0f10] text-zinc-100 flex flex-col">
      {showCloudPanel && (
        <div className="fixed inset-0 z-50 bg-black/80 p-4 grid place-items-center">
          <section role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-2xl border border-zinc-600 bg-zinc-900 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center gap-4">
              <h2 id="publish-title" className="text-xl font-bold">Подключить публикацию на телевизоры</h2>
              <button onClick={() => setShowCloudPanel(false)} aria-label="Закрыть подключение" className="px-3 py-2 rounded bg-zinc-700">✕</button>
            </div>
            <p className="text-amber-200">Без доступа к записи кнопка не может отправить меню на ТВ. Подключение GitHub в чате не подключает браузер админки.</p>
            <p>Нужно один раз разрешить запись только в <b>maxzakir-glitch/SushiOrdo</b>. Исходному кафе доступ не нужен.</p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
              <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="underline text-sky-300">Создать GitHub-токен</a> под аккаунтом maxzakir-glitch.</li>
              <li>Repository access → Only select repositories → SushiOrdo. Repository permissions → Contents → Read and write.</li>
              <li>Создать токен и вставить его в поле ниже. Не отправлять в чат, не добавлять в ссылку.</li>
            </ol>
            <label className="block text-sm">GitHub-токен для публикации
              <input id="publish-token" type="password" autoComplete="off" value={tokenInput} onChange={e => setTokenInput(e.target.value)} className="mt-2 w-full p-3 rounded-xl bg-black border border-zinc-600" />
            </label>
            <button onClick={connectToken} disabled={!tokenInput.trim() || !ready || cloud.s === 'push'} className="w-full px-4 py-3 rounded-xl bg-emerald-500 text-black font-bold disabled:opacity-40">Подключить и отправить черновик на ТВ</button>
            {cloud.s === 'push' && <p role="status">Отправляю меню. Не закрывайте страницу…</p>}
            {cloud.s === 'err' && <p role="alert" className="text-red-300 break-words">Не опубликовано: {cloud.msg}</p>}
            {connectMsg && <p role="status" className="break-words">{connectMsg}</p>}
            <p className="text-xs text-zinc-400">Черновик не удаляется при закрытии этого окна. Если подключение уже есть, но выдаёт ошибку, здесь можно заменить токен.</p>
          </section>
        </div>
      )}
      {ready && !hasToken() && <div role="status" className="p-4 bg-amber-950 text-amber-100 border-b border-amber-600 flex flex-wrap items-center justify-between gap-3">
        <span><b>На ТВ изменения пока не отправляются.</b> Подключите публикацию один раз. До этого правки остаются только на этом устройстве.</span>
        <button onClick={() => setShowCloudPanel(true)} className="px-4 py-2 rounded-lg bg-amber-200 text-black font-bold">Подключить публикацию</button>
      </div>}

      {cloudNewer && (
        <div className="bg-amber-400 text-zinc-900 px-6 py-2.5 text-sm font-semibold flex flex-wrap items-center justify-between gap-2">
          <span>⚠ Облачная версия отличается ({fmtTime(cloudNewer)}). Автоматическая перезапись заблокирована. Сначала скачайте резервную копию черновика; загрузка облачной версии заменит ваши неопубликованные правки.</span>
          <button onClick={async () => { if (!confirm('Забрать данные из облака? Несохранённые правки этой вкладки пропадут.')) return; await manualPull(); setCloudNewer(''); }} className="px-3 py-1 rounded-lg bg-zinc-900 text-white font-bold">Забрать из облака</button>
        </div>
      )}
      {!ready && <div className="p-3 bg-sky-900">Восстанавливаю черновик и проверяю облако…</div>}
      {localError && <div role="alert" className="p-3 bg-red-900">{localError}</div>}
      <button onClick={exportDraft} className="px-4 py-2 bg-zinc-800 text-sm">Скачать резервную копию JSON</button>
      <header className="sticky top-0 z-30 bg-zinc-900/80 backdrop-blur border-b border-zinc-800">
        <div className="max-w-[1480px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Суши ORDO — Админка · 6 ТВ</h1>
            <p className="text-xs text-zinc-400">Figma-холст: тяни плашки мышкой куда хочешь → на ТВ будет 1-в-1. Черновик хранится на устройстве. После успешной публикации все ТВ получают облачную версию.</p>
          </div>
          <div className="flex gap-2 items-center">
            {cloudChip}
            <button onClick={manualPull} title="Загрузить облачную версию с защитой черновика" className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm border border-zinc-700">⟳ Обновить данные</button>
            <Link to={`/tv/${activeScreenId}`} target="_blank" className="px-4 py-2 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100">Открыть ТВ ▶</Link>
          </div>
        </div>
      </header>

      <div inert={!ready} className="max-w-[1480px] mx-auto w-full flex flex-1 min-h-0">
        <aside className="w-[320px] shrink-0 border-r border-zinc-800 p-4 flex flex-col gap-4 bg-zinc-900/30">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Экраны</h2>
              <button onClick={() => updateStore((d) => { let n = 1; while (d.screens.some(s => s.id === 'tv' + n)) n++; const id = 'tv' + n; d.screens.push({ id, name: `Экран ${d.screens.length + 1}`, slides: [{ id: uid(), type: 'image', bg: PLACEHOLDER, duration: 25, transition: 'fade', items: [{ ...createEmptyItem(), x: 6, y: 68, w: 52 }] }] }); })} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700">+ Экран</button>
            </div>
            <div className="flex flex-col gap-2">
              {store.screens.map((s) => (
                <div key={s.id} className={`group relative rounded-xl border ${activeScreenId === s.id ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                  <button onClick={() => { setActiveScreenId(s.id); setActiveSlideId(s.slides[0]?.id); }} className="w-full text-left px-3 py-3 flex items-center justify-between">
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${activeScreenId === s.id ? 'bg-zinc-900 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{s.slides.length} листов</span>
                  </button>
                  {store.screens.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); if (!confirm(`Удалить «${s.name}» со всеми листами (${s.slides.length} шт.)?`)) return; const wasActive = activeScreenId === s.id; updateStore((d) => { d.screens = d.screens.filter((x) => x.id !== s.id); }); if (wasActive) { const nxt = store.screens.find((x) => x.id !== s.id); if (nxt) { setActiveScreenId(nxt.id); setActiveSlideId(nxt.slides[0]?.id); setSelectedId(nxt.slides[0]?.items[0]?.id || null); } } }} title="Удалить экран" className="absolute -top-1.5 -right-1.5 w-6 h-6 grid place-items-center rounded-full bg-red-600 text-white text-xs opacity-0 group-hover:opacity-100 transition shadow">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {screen && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Листы экрана</h2>
                <button onClick={() => updateStore((d) => { const sc = d.screens.find((x) => x.id === activeScreenId); const ns = { id: uid(), type: 'image', bg: PLACEHOLDER, duration: 25, transition: 'fade', items: [{ ...createEmptyItem(), x: 6, y: 48, w: 48 }] }; sc.slides.push(ns); setActiveSlideId(ns.id); setSelectedId(ns.items[0].id); })} className="text-xs px-2 py-1 rounded-lg bg-white text-zinc-900 font-semibold hover:bg-zinc-100">+ Лист</button>
              </div>
              <div className="flex flex-col gap-2 overflow-auto pr-1">
                {screen.slides.map((sl, i) => (
                  <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setSelectedId(sl.items[0]?.id || null); }} className={`group relative rounded-xl overflow-hidden border cursor-pointer ${activeSlideId === sl.id ? 'border-white ring-2 ring-white/20' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    <div className="h-[110px] bg-zinc-800 relative">
                      {sl.type === 'video' ? <video src={sl.bg} muted className="w-full h-full object-cover opacity-80" /> : <img src={sl.bg} alt="" className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold bg-black/60 backdrop-blur px-2 py-1 rounded-full text-white">#{i + 1} • {sl.transition} • {sl.duration}с</span>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={(e) => { e.stopPropagation(); updateStore((d) => { const sc = d.screens.find((x) => x.id === activeScreenId); const idx = sc.slides.findIndex((x) => x.id === sl.id); if (idx > 0) [sc.slides[idx - 1], sc.slides[idx]] = [sc.slides[idx], sc.slides[idx - 1]]; }); }} className="w-7 h-7 grid place-items-center rounded-lg bg-black/70 text-white text-xs">↑</button>
                        <button onClick={(e) => { e.stopPropagation(); updateStore((d) => { const sc = d.screens.find((x) => x.id === activeScreenId); const idx = sc.slides.findIndex((x) => x.id === sl.id); if (idx < sc.slides.length - 1) [sc.slides[idx + 1], sc.slides[idx]] = [sc.slides[idx], sc.slides[idx + 1]]; }); }} className="w-7 h-7 grid place-items-center rounded-lg bg-black/70 text-white text-xs">↓</button>
                        <button onClick={(e) => { e.stopPropagation(); if (!confirm('Удалить лист?')) return; updateStore((d) => { const sc = d.screens.find((x) => x.id === activeScreenId); sc.slides = sc.slides.filter((x) => x.id !== sl.id); }); const nxt = screen.slides.find((x) => x.id !== sl.id); if (nxt) { setActiveSlideId(nxt.id); setSelectedId(nxt.items[0]?.id || null); } }} className="w-7 h-7 grid place-items-center rounded-lg bg-red-600 text-white text-xs">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs leading-relaxed text-amber-200">
                На ТВ открой <code className="bg-black/40 px-1.5 py-0.5 rounded">#/tv/{screen.id}</code> на весь экран. Ссылки:<br />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {store.screens.map((s) => <Link key={s.id} to={`/tv/${s.id}`} target="_blank" className="px-2 py-1 rounded-full bg-white text-zinc-900 font-bold text-[11px]">TV {s.id} ↗</Link>)}
                </div>
              </div>
            </div>
          )}

          {/* ---- облако ---- */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold tracking-wide">☁ Облако — все устройства</span>
              {hasToken() ? <span className="text-emerald-400 font-bold">подключено ✓</span> : <span className="text-amber-400 font-bold">не подключено</span>}
            </div>
            {!hasToken() ? (
              <>
                <p className="text-zinc-400 leading-relaxed">Черновик сохраняется только на этом устройстве. Для публикации вставьте fine-grained GitHub-токен: только SushiOrdo, Contents: Read and write. Никому не отправляйте токен и не вставляйте его в адрес ссылки.</p>
                <div className="flex gap-1.5">
                  <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} type="password" autoComplete="off" placeholder="GitHub-токен только для SushiOrdo" className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700 outline-none font-mono text-[11px]" />
                  <button onClick={connectToken} className="px-3 py-2 rounded-lg bg-white text-zinc-900 font-bold hover:bg-zinc-100">OK</button>
                </div>
                {connectMsg && <p className={`leading-relaxed ${connectMsg.startsWith('✓') ? 'text-emerald-300' : connectMsg.startsWith('✗') ? 'text-red-300' : 'text-zinc-400'}`}>{connectMsg}</p>}
              </>
            ) : (
              <>
                <p className="text-zinc-400 leading-relaxed">Правки публикуются в облако сами ~4 сек после того, как остановился. ТВ проверяют версию каждые 10 секунд; сеть/CDN могут добавить задержку. Редактируй с одного устройства за раз.</p>
                <div className="flex gap-1.5">
                  <button onClick={doPush} className="flex-1 px-2 py-2 rounded-lg bg-white text-zinc-900 font-bold hover:bg-zinc-100">⬆ Выгрузить сейчас</button>
                  <button onClick={manualPull} className="flex-1 px-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 font-semibold">⬇ Забрать из облака</button>
                </div>
                <div className="flex gap-1.5 items-center">
                  <button onClick={testConnection} className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] hover:bg-zinc-700">🔌 Проверить соединение</button>
                  <button onClick={() => { setToken(''); setCloud({ s: 'no' }); setConnectMsg(''); }} className="text-zinc-500 underline hover:text-zinc-300 text-[11px]">Отключить токен</button>
                </div>
                {connectMsg && <p className={`leading-relaxed ${connectMsg.startsWith('✓') ? 'text-emerald-300' : connectMsg.startsWith('✗') ? 'text-red-300' : 'text-zinc-400'}`}>{connectMsg}</p>}
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-6 flex flex-col gap-6 overflow-auto">
          {!slide ? <div className="flex-1 grid place-items-center text-zinc-500">Выбери лист слева</div> : (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Холст — тяни плашки как в Figma (16:9 = 1-в-1 с ТВ)</h3>
                  <div className="flex gap-2">
                    <button onClick={() => updateStore((d) => { const sl = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId); sl.items.push({ ...createEmptyItem(), x: 28, y: 42 }); setSelectedId(sl.items[sl.items.length - 1].id); })} className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 font-bold text-sm">+ Плашка</button>
                    <Link to={`/tv/${activeScreenId}`} target="_blank" className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-sm hover:bg-zinc-700">Открыть на ТВ</Link>
                  </div>
                </div>

                <CanvasStage
                  slide={slide}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMoveItem={(id, x, y) => patchItem(id, { x, y })}
                  onResizeItem={(id, w, x) => patchItem(id, { w, x })}
                />
                <p className="text-xs text-zinc-500 mt-2">Куда поставил — там и на ТВ. Координаты в % сохраняются, поэтому на любом экране одинаково. Выделяй плашку на холсте или в списке справа.</p>
              </div>

              <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
                <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-4">
                  <h4 className="font-semibold">Лист</h4>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs tracking-widest uppercase text-zinc-400">Название экрана</span>
                    <input value={screen.name} onChange={(e) => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).name = e.target.value; })} className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-zinc-500" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs tracking-widest uppercase text-zinc-400">Тип</span>
                      <select value={slide.type} onChange={(e) => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).type = e.target.value; })} className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                        <option value="image">Фото</option>
                        <option value="video">Видео (MP4 muted)</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs tracking-widest uppercase text-zinc-400">Длительность (сек)</span>
                      <input type="number" min={2} max={60} value={slide.duration} onChange={(e) => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).duration = Number(e.target.value) || 25; })} className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700" />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs tracking-widest uppercase text-zinc-400">Переход</span>
                    <select value={slide.transition} onChange={(e) => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).transition = e.target.value; })} className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                      {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs tracking-widest uppercase text-zinc-400">{slide.type === 'video' ? 'Ссылка на MP4' : 'Фон листа — загрузи свою картинку'}</span>
                    <div className="flex gap-2 flex-wrap">
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickFile} className="hidden" />
                      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/m4v" onChange={onPickVideo} className="hidden" />
                      <button onClick={() => fileInputRef.current?.click()} className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-zinc-900 font-bold text-sm hover:bg-zinc-100">📤 Загрузить фото</button>
                      <button onClick={() => videoInputRef.current?.click()} disabled={videoUploading} className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold ${videoUploading ? 'bg-zinc-700 text-zinc-300 animate-pulse' : 'bg-sky-600 text-white hover:bg-sky-500'}`}>{videoUploading ? '⏳ Загружаю видео… не закрывай страницу' : '🎬 Загрузить видео'}</button>
                      <input value={slide.bg?.startsWith('data:') ? '— загружено из файла (сохранится на сайте) —' : slide.bg?.includes('/data/media/') ? '— медиа загружено в облако —' : slide.bg} onChange={(e) => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).bg = e.target.value; })} placeholder="https://... или /my-photo.jpg или Загрузить фото" className="flex-1 min-w-[200px] px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 outline-none text-xs" />
                    </div>
                    <span className="text-[11px] text-zinc-500">Фото: JPG/PNG/WebP — сожмётся до 1920px. Видео: MP4 (H.264), до 45 МБ — загрузится прямо в облако (1-3 мин). Или вставь ссылку / путь <code className="bg-zinc-800 px-1 py-0.5 rounded">/file.jpg</code>.</span>
                    {slide.bg?.startsWith('data:') && <button onClick={() => updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).bg = PLACEHOLDER; })} className="self-start text-xs px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700">Убрать фото → заставка ORDO</button>}
                  </label>
                </section>

                <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Плашки — выбери на холсте</h4>
                    <span className="text-xs text-zinc-500">{slide.items.length} шт.</span>
                  </div>

                  {/* small list to select */}
                  <div className="flex flex-wrap gap-2">
                    {slide.items.map((it) => (
                      <button key={it.id} onClick={() => setSelectedId(it.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedId === it.id ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}>
                        {it.title || it.name || '—'} {selectedId === it.id ? '●' : ''}
                      </button>
                    ))}
                  </div>

                  {!selected ? (
                    <p className="text-sm text-zinc-500 py-6 text-center">Выбери плашку на холсте или нажми + Плашка</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col gap-3">
                        <label className="flex flex-col gap-1 text-xs text-zinc-400">Заголовок
                          <input value={selected.title} onChange={(e) => patchItem(selected.id, { title: e.target.value })} placeholder="Сочный Бургер" className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 outline-none font-semibold text-white" />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-400">Описание (необязательно)
                          <input value={selected.desc || ''} onChange={(e) => patchItem(selected.id, { desc: e.target.value })} placeholder="Говядина, сыр чеддер, свежие овощи" className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 outline-none text-sm" />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-400">Граммовка (необязательно) — показываю только если заполнена
                          <input value={selected.weight || ''} onChange={(e) => patchItem(selected.id, { weight: e.target.value })} placeholder="250 г / 0,5 л / 150/30 г" className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 outline-none text-sm font-mono" />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-xs text-zinc-400">Цена
                            <input value={selected.price} onChange={(e) => patchItem(selected.id, { price: e.target.value })} placeholder="450 ₽" className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 font-bold" />
                          </label>
                          <button onClick={() => { if (!confirm('Удалить плашку?')) return; updateStore((d) => { const sl = d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId); sl.items = sl.items.filter((x) => x.id !== selected.id); }); setSelectedId(slide.items.find((x) => x.id !== selected.id)?.id || null); }} className="self-end px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold">Удалить</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <label className="flex flex-col gap-1">X
                            <input type="range" min={0} max={88} step={0.5} value={selected.x} onChange={(e) => patchItem(selected.id, { x: Number(e.target.value) })} />
                            <span className="text-zinc-400 font-mono">{selected.x.toFixed(1)}%</span>
                          </label>
                          <label className="flex flex-col gap-1">Y
                            <input type="range" min={0} max={88} step={0.5} value={selected.y} onChange={(e) => patchItem(selected.id, { y: Number(e.target.value) })} />
                            <span className="text-zinc-400 font-mono">{selected.y.toFixed(1)}%</span>
                          </label>
                          <label className="flex flex-col gap-1">Ширина
                            <input type="range" min={14} max={88} value={selected.w} onChange={(e) => patchItem(selected.id, { w: Number(e.target.value) })} />
                            <span className="text-zinc-400 font-mono">{selected.w.toFixed(0)}%</span>
                          </label>
                        </div>
                      </div>

                      {/* Figma-like style panel */}
                      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold tracking-widest uppercase text-zinc-400">Стиль как в Figma</span>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${copiedStyle ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>{copiedStyle ? '✓ стиль скопирован' : '—'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={copyStyleFromSelected} className="px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-xs font-bold border border-zinc-600">⎘ Копировать стиль</button>
                          <button onClick={pasteStyleToSelected} disabled={!copiedStyle} className={`px-3 py-2 rounded-xl text-xs font-bold border ${copiedStyle ? 'bg-white text-zinc-900 border-white hover:bg-zinc-100' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>⎗ Вставить стиль</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={applyStyleToAllOnSlide} className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold">Применить ко всем на листе</button>
                          <button onClick={applyStyleToAllEverywhere} className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold">Применить ко всем везде</button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-xs">Фон
                            <input type="color" value={selected.style.bg} onChange={(e) => patchStyle(selected.id, { bg: e.target.value })} className="h-9 w-full rounded-lg bg-transparent border border-zinc-700 p-1" />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">Цена — фон
                            <input type="color" value={selected.style.priceBg} onChange={(e) => patchStyle(selected.id, { priceBg: e.target.value })} className="h-9 w-full rounded-lg bg-transparent border border-zinc-700 p-1" />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-xs">Текст
                            <input type="color" value={selected.style.textColor} onChange={(e) => patchStyle(selected.id, { textColor: e.target.value })} className="h-9 w-full rounded-lg bg-transparent border border-zinc-700 p-1" />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">Цена — текст
                            <input type="color" value={selected.style.priceColor} onChange={(e) => patchStyle(selected.id, { priceColor: e.target.value })} className="h-9 w-full rounded-lg bg-transparent border border-zinc-700 p-1" />
                          </label>
                        </div>

                        <label className="flex flex-col gap-1 text-xs">Прозрачность фона — {Math.round(selected.style.bgOpacity * 100)}%
                          <input type="range" min={0} max={1} step={0.02} value={selected.style.bgOpacity} onChange={(e) => patchStyle(selected.id, { bgOpacity: Number(e.target.value) })} />
                          <span className="h-2 rounded-full border border-zinc-700 block" style={{ background: hexToRgba(selected.style.bg, selected.style.bgOpacity), backdropFilter: `blur(${selected.style.blur}px)` }} />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">Блюр за плашкой — {selected.style.blur}px
                          <input type="range" min={0} max={24} step={1} value={selected.style.blur} onChange={(e) => patchStyle(selected.id, { blur: Number(e.target.value) })} />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-xs">Скругление — {selected.style.radius}px
                            <input type="range" min={0} max={32} step={1} value={selected.style.radius} onChange={(e) => patchStyle(selected.id, { radius: Number(e.target.value) })} />
                          </label>
                          <label className="flex flex-col gap-1 text-xs">Граница — {Math.round(selected.style.borderOpacity * 100)}%
                            <input type="range" min={0} max={1} step={0.05} value={selected.style.borderOpacity} onChange={(e) => patchStyle(selected.id, { borderOpacity: Number(e.target.value) })} />
                          </label>
                        </div>

                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={selected.style.shadow} onChange={(e) => patchStyle(selected.id, { shadow: e.target.checked })} />
                          Тень
                        </label>

                        <div className="flex gap-2">
                          <button onClick={() => patchItem(selected.id, { x: 6, y: 68, w: 36 })} className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-700 text-xs hover:bg-zinc-600">Сбросить позицию</button>
                          <button onClick={() => { const c = structuredClone(selected); c.id = uid(); c.x = Math.min(70, c.x + 4); c.y = Math.min(78, c.y + 4); updateStore((d) => { d.screens.find((x) => x.id === activeScreenId).slides.find((x) => x.id === activeSlideId).items.push(c); }); setSelectedId(c.id); }} className="flex-1 px-3 py-1.5 rounded-xl bg-white text-zinc-900 font-semibold text-xs">Дублировать</button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex items-center justify-between gap-4">
                <div className="text-sm min-w-0 space-y-2">
                  <p className="text-zinc-400">Черновик и публикация на ТВ — разные состояния. Успешная отправка подтверждается отдельным зелёным сообщением ниже.</p>
                  <div aria-live="polite" className="break-words">
                    {!hasToken() ? <p className="text-amber-200 font-semibold">Не отправлено на ТВ: публикация не подключена.</p>
                      : cloud.s === 'err' ? <div role="alert" className="text-red-300"><b>Не опубликовано.</b> {cloud.msg}<br /><button onClick={() => setShowCloudPanel(true)} className="underline mt-2">Проверить или заменить подключение</button></div>
                      : cloud.s === 'push' ? <p className="text-sky-200">Отправляю на ТВ… Дождитесь подтверждения.</p>
                      : cloud.s === 'queued' ? <p className="text-amber-200">Есть правки, ожидающие отправки на ТВ.</p>
                      : cloud.s === 'check' ? <p>Проверяю облачную версию…</p>
                      : <p className="text-emerald-200">{connectMsg.startsWith('✓ Записано') ? connectMsg : 'Прочитана опубликованная версия меню. Новые правки потребуют публикации.'}</p>}
                  </div>
                </div>
                <button onClick={saveToTv} disabled={!ready || cloud.s === 'push'} className="shrink-0 px-5 py-2.5 rounded-xl bg-emerald-500 text-zinc-900 font-bold hover:bg-emerald-400 disabled:opacity-50">{cloud.s === 'push' ? 'Отправляю…' : 'Сохранить'}</button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
