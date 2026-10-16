import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { loadTvStore as loadStore, cacheTvStore as cacheStore } from '../lib/tvCache';
import { fetchCloud } from '../lib/cloud';
import GlassPill from '../components/GlassPill';
import DisplacementTransition from '../components/DisplacementTransition';

// метка версии сборки — видна в верхней полосе ТВ, чтобы понимать: свежая версия или кэш
const APP_VERSION = 'SushiOrdo-2.0';

const variants = {
  fade: { initial: { opacity: 0, scale: 1.04, filter: 'blur(6px)' }, animate: { opacity: 1, scale: 1, filter: 'blur(0px)' }, exit: { opacity: 0, scale: 0.98, filter: 'blur(6px)' } },
  slide: { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '-30%', opacity: 0 } },
  zoom: { initial: { scale: 1.25, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 } },
  blinds: { initial: { clipPath: 'inset(0 100% 0 0)', opacity: 0 }, animate: { clipPath: 'inset(0 0% 0 0)', opacity: 1 }, exit: { clipPath: 'inset(0 0 0 100%)', opacity: 0 } },
  cube: { initial: { rotateY: 90, opacity: 0, transformOrigin: 'right center' }, animate: { rotateY: 0, opacity: 1 }, exit: { rotateY: -90, opacity: 0, transformOrigin: 'left center' } },
  pixel: { initial: { opacity: 0, filter: 'blur(10px) contrast(1.5)' }, animate: { opacity: 1, filter: 'blur(0px) contrast(1)' }, exit: { opacity: 0, filter: 'blur(12px)' } },
};

function Slide({ slide }) {
  const isVideo = slide.type === 'video';
  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={{ perspective: 1200 }}>
      {isVideo ? (
        <video src={slide.bg} autoPlay muted loop playsInline preload="auto" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <motion.img src={slide.bg} alt="" className="absolute inset-0 w-full h-full object-cover" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: slide.duration + 1, ease: 'linear' }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10 pointer-events-none" />
      {slide.items?.map((item, idx) => (
        <div key={item.id} style={{ position: 'absolute', left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, fontSize: 'clamp(10px, 1.05vw, 22px)' }}>
          <GlassPill item={item} index={idx} />
        </div>
      ))}
    </div>
  );
}

export default function TvPlayer() {
  const { id } = useParams();
  const [store, setStore] = useState(() => loadStore());
  const [idx, setIdx] = useState(0);
  const [disp, setDisp] = useState(null); // {fromBg, toBg, key}
  const timerRef = useRef(null);
  const screen = store.screens.find((s) => s.id === id);
  const slides = screen?.slides?.length ? screen.slides : [];

  const goNext = useCallback((nextIdx) => {
    const cur = slides[idx];
    const nxt = slides[nextIdx];
    if (!cur || !nxt) return setIdx(nextIdx);
    const useDisp = cur.transition === 'displacement' || nxt.transition === 'displacement';
    // if either side is video, skip displacement (texture from video is messy)
    const needsTexture = useDisp && cur.type !== 'video' && nxt.type !== 'video';
    if (needsTexture) {
      setDisp({ from: cur.bg, to: nxt.bg, pendingIdx: nextIdx, key: `${cur.id}->${nxt.id}-${Date.now()}` });
    } else {
      setIdx(nextIdx);
    }
  }, [slides, idx]);

  // облако: подтягиваем свежие данные сами (кэш браузера сводит трафик к дешёвым проверкам)
  const lastCloud = useRef('');
  const polling = useRef(false);
  const [syncError, setSyncError] = useState('');
  const pollCloud = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const cloud = await fetchCloud(15000, true, false);
      setSyncError('');
      if (cloud.revision === lastCloud.current) return;
      lastCloud.current = cloud.revision;
      setStore(cloud.data);
      cacheStore(cloud.data);
      setIdx(0); setDisp(null);
    } catch (e) { setSyncError('Нет связи с меню. Последняя загруженная версия остаётся на экране.'); }
    finally { polling.current = false; }
  }, []);
  useEffect(() => {
    pollCloud();
    const iv = setInterval(pollCloud, 10000);
    const onVis = () => { if (document.visibilityState !== 'hidden') pollCloud(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', pollCloud);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', pollCloud); };
  }, [pollCloud]);
  useEffect(() => { setIdx(0); setDisp(null); }, [id, screen?.id]);

  // autoplay
  useEffect(() => {
    if (!slides.length || disp) return; // pause while displacement plays
    const dur = (slides[idx]?.duration || 7) * 1000;
    timerRef.current = setTimeout(() => {
      const next = (idx + 1) % slides.length;
      goNext(next);
    }, dur);
    return () => clearTimeout(timerRef.current);
  }, [idx, slides, disp, goNext]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const containerRef = useRef(null);
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  useEffect(() => {
    if (!isFullscreen) { setShowChrome(true); return; }
    setShowChrome(true);
    const t = setTimeout(() => setShowChrome(false), 4000);
    const onMove = () => { setShowChrome(true); clearTimeout(t); };
    window.addEventListener('mousemove', onMove);
    return () => { clearTimeout(t); window.removeEventListener('mousemove', onMove); };
  }, [isFullscreen, idx, disp]);
  useEffect(() => {
    const onKey = (e) => {
      if (disp) return;
      if (e.key === 'ArrowRight') goNext((idx + 1) % slides.length);
      if (e.key === 'ArrowLeft') goNext((idx - 1 + slides.length) % slides.length);
      if (e.key === 'f' || e.key === 'F') containerRef.current?.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, idx, disp, goNext]);

  async function toggleFullscreen() {
    try { if (!document.fullscreenElement) await containerRef.current?.requestFullscreen(); else await document.exitFullscreen(); } catch {}
  }
  function handleDispDone() {
    if (disp) {
      setIdx(disp.pendingIdx);
      setDisp(null);
    }
  }

  if (!screen) return <div className="w-screen h-screen grid place-items-center text-white">Суши ORDO: экран {id} не найден. Проверьте ссылку ТВ1–ТВ6 и подключение к интернету. {syncError}</div>;
  if (!slides.length) return <div className="w-screen h-screen grid place-items-center text-white/60">Нет слайдов — добавь в /admin</div>;
  const current = slides[Math.min(idx, slides.length - 1)];

  const useFramer = !disp;
  // displacement takes over: render GL canvas instead of framer
  return (
    <div ref={containerRef} className="w-screen h-screen bg-black overflow-hidden relative select-none">
      <div className={`absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-2 bg-black/55 backdrop-blur text-white/90 text-xs tracking-wide transition-opacity duration-500 ${isFullscreen && !showChrome ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <span>{screen.name} • {idx + 1} / {slides.length} • {current.transition} • {current.duration}с • v{APP_VERSION} {disp ? '• liquid warp…' : ''}</span>
        <span className="flex items-center gap-2">
          <span className="opacity-60 hidden sm:inline">← → листать • F фуллскрин</span>
          <button onClick={toggleFullscreen} className="px-3 py-1.5 rounded-full bg-white text-black font-bold hover:bg-zinc-100">{isFullscreen ? 'Выйти' : '⛶ На весь экран'}</button>
        </span>
      </div>

      <div className={`absolute inset-0 ${isFullscreen && !showChrome ? 'pt-0' : 'pt-8'} transition-all`} style={{ perspective: 1200 }}>
        {disp ? (
          <>
            {/* keep pills of target slide fading in during warp */}
            <div key={disp.key} className="absolute inset-0">
              <DisplacementTransition from={disp.from} to={disp.to} duration={1100} onDone={handleDispDone} />
              {/* pills warp overlay — simple crossfade on top of GL */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.5 }} className="absolute inset-0 pointer-events-none">
                {slides[disp.pendingIdx]?.items?.map((item, i) => (
                  <motion.div key={item.id} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.07 }} style={{ position: 'absolute', left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, fontSize: 'clamp(10px, 1.05vw, 22px)' }}>
                    <GlassPill item={item} index={i} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </>
        ) : useFramer ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id + '-' + idx}
              variants={variants[current.transition] || variants.fade}
              initial="initial" animate="animate" exit="exit"
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              <Slide slide={current} />
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>

      {!isFullscreen && !disp && <button onClick={toggleFullscreen} className="absolute inset-0 z-10 cursor-pointer opacity-0" aria-label="tap for fullscreen" />}
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 transition-opacity ${isFullscreen && !showChrome ? 'opacity-0' : 'opacity-100'}`}>
        {slides.map((_, i) => <button key={i} onClick={() => !disp && goNext(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-8 bg-white' : 'w-5 bg-white/35'}`} />)}
      </div>
      {syncError && <div role="status" className="absolute bottom-1 left-2 z-30 text-xs text-amber-300 bg-black/70 px-2">{syncError}</div>}
    </div>
  );
}
