import { motion } from 'framer-motion';
import { hexToRgba } from '../lib/store';

export default function GlassPill({ item, index = 0, interactive = false, selected = false, onSelect }) {
  const s = item.style || {};
  const bg = hexToRgba(s.bg || '#ffffff', s.bgOpacity ?? 0.82);
  const border = hexToRgba(s.bg || '#ffffff', s.borderOpacity ?? 0.5);
  const blur = s.blur ?? 14;
  const radius = s.radius ?? 20;
  const shadow = s.shadow ? '0 8px 32px rgba(0,0,0,0.18)' : 'none';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.18 + index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={interactive ? onSelect : undefined}
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        background: bg,
        borderColor: border,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        borderRadius: radius,
        boxShadow: shadow,
        borderWidth: 1,
        borderStyle: 'solid',
      }}
      className={`px-5 py-4 flex flex-col gap-1.5 select-none ${selected ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-black/20' : ''} ${interactive ? 'cursor-grab active:cursor-grabbing hover:shadow-[0_12px_40px_rgba(0,0,0,0.24)]' : ''}`}
    >
      {/* 1. Заголовок */}
      <div style={{ color: s.textColor || '#18181b', fontSize: '1em' }} className="font-bold leading-tight tracking-tight">
        {item.title || item.name}
      </div>

      {/* 2. Описание — если есть */}
      {item.desc ? (
        <div style={{ color: s.textColor || '#18181b', opacity: 0.68, fontSize: '0.62em' }} className="font-medium leading-snug">
          {item.desc}
        </div>
      ) : null}

      {/* 3. Граммовка — если указана */}
      {item.weight ? (
        <div style={{ color: s.textColor || '#18181b', opacity: 0.55, fontSize: '0.58em' }} className="font-semibold tracking-wide">
          {item.weight}
        </div>
      ) : null}

      {/* 4. Цена — всегда вертикально последней */}
      <div className="pt-1">
        <span
          style={{ background: s.priceBg || '#18181b', color: s.priceColor || '#ffffff', borderRadius: Math.max(10, (radius - 8)), fontSize: '0.82em' }}
          className="inline-flex font-extrabold px-3 py-1.5 leading-none"
        >
          {item.price}
        </span>
      </div>

      {interactive && (
        <span className="text-[10px] tracking-widest uppercase opacity-50" style={{ color: s.textColor || '#18181b' }}>
          blur {s.blur}px • {Math.round((s.bgOpacity ?? 0.82) * 100)}%
        </span>
      )}
    </motion.div>
  );
}
