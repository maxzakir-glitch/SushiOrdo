import { useRef, useState, useCallback } from 'react';
import GlassPill from './GlassPill';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export default function CanvasStage({ slide, selectedId, onSelect, onMoveItem, onResizeItem }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);

  const getPct = useCallback((clientX, clientY) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }, []);

  function onPointerDown(e, item) {
    e.preventDefault(); e.stopPropagation();
    onSelect(item.id);
    const pct = getPct(e.clientX, e.clientY);
    const sx = pct.x - item.x, sy = pct.y - item.y;
    const move = (ev) => {
      const p = getPct(ev.clientX, ev.clientY);
      // clamp strictly to canvas, no auto-resize
      const nx = clamp(p.x - sx, 0, 100 - (item.w || 30));
      const ny = clamp(p.y - sy, 0, 100 - 8);
      onMoveItem(item.id, nx, ny);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDrag(null); };
    setDrag({ id: item.id });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onResizePointerDown(e, item) {
    e.preventDefault(); e.stopPropagation();
    onSelect(item.id);
    const startX = e.clientX, startW = item.w;
    const r = ref.current?.getBoundingClientRect();
    const move = (ev) => {
      const dPct = ((ev.clientX - startX) / (r?.width || 1)) * 100;
      const nw = clamp(startW + dPct, 14, 88);
      const nx = clamp(item.x, 0, 100 - nw);
      onResizeItem(item.id, nw, nx);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div ref={ref} onClick={() => onSelect(null)} className="relative aspect-video rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-2xl select-none">
      {slide.type === 'video' ? <video src={slide.bg} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover pointer-events-none" /> : <img src={slide.bg} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
      {slide.items.map((it, idx) => (
        <div key={it.id} onPointerDown={(e) => onPointerDown(e, it)} onClick={(e) => { e.stopPropagation(); onSelect(it.id); }} style={{ position: 'absolute', left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, touchAction: 'none' }} className="group">
          <div className={`${selectedId === it.id ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-black/40 rounded-[14px]' : ''}`}>
            <GlassPill item={it} index={idx} interactive selected={selectedId === it.id} onSelect={() => onSelect(it.id)} />
          </div>
          {selectedId === it.id && <div onPointerDown={(e) => onResizePointerDown(e, it)} className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-10 rounded-full bg-white border border-zinc-800 shadow flex items-center justify-center cursor-ew-resize" title="Тяни для ширины"><span className="w-0.5 h-5 bg-zinc-400 rounded-full" /></div>}
          {selectedId === it.id && <div className="absolute -top-6 left-0 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded backdrop-blur">x:{it.x.toFixed(1)} y:{it.y.toFixed(1)} w:{it.w.toFixed(0)}%</div>}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '8.333% 10%' }} />
      <div className={`absolute bottom-2 left-2 text-[10px] px-2 py-1 rounded-full bg-black/60 backdrop-blur text-white/80 ${drag ? 'opacity-100' : 'opacity-60'}`}>{drag ? 'Перетаскиваю…' : 'Кликни плашку → тяни куда хочешь • Правый хэндл — ширина'}</div>
    </div>
  );
}
