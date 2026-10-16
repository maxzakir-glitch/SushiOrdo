// One-time, read-only import of an exact upstream commit. All writes target SushiOrdo.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync as exec } from 'node:child_process';
const root = process.cwd();
const marker = '.sushi-origin';
if (fs.existsSync(marker)) process.exit(0);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-source-'));
const sha = '1c449b5c316fefc7956aca2079dbef54c6ff8387';
try {
  exec('git', ['clone', '--quiet', 'https://github.com/ahror1994/cafe-menu-board.git', temp]);
  exec('git', ['checkout', '--quiet', sha], { cwd: temp });
  const files = exec('git', ['ls-files', '-z'], { cwd: temp, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of files) {
    const dest = path.join(root, file);
    if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(temp, file), dest); }
  }
  function edit(file, fn) { fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8'))); }
  function replace(text, from, to) { if (!text.includes(from)) throw new Error('Upstream mismatch: ' + from.slice(0, 80)); return text.replace(from, to); }
  edit('src/lib/store.js', s => {
    s = replace(s, "const KEY = 'cafe-menu-v3';", "import { STORE_KEY, PLACEHOLDER } from './config.js';\nconst KEY = STORE_KEY;");
    s = replace(s, "const OLD_KEYS = ['cafe-menu-v1', 'cafe-menu-v2'];", 'const OLD_KEYS = []; // Never migrate data from the original cafe.');
    const start = s.indexOf('const RAW_DEFAULT = {'); const end = s.indexOf('\nexport function normalizeStore', start);
    if (start < 0 || end < 0) throw new Error('Default marker missing');
    s = s.slice(0, start) + `const RAW_DEFAULT = { screens: Array.from({ length: 6 }, (_, i) => ({ id: 'tv' + (i + 1), name: 'Суши ORDO — ТВ ' + (i + 1), slides: [{ id: 'ordo-slide-' + (i + 1), type: 'image', bg: PLACEHOLDER, duration: 10, transition: 'fade', items: [] }] })) };\n` + s.slice(end);
    s = s.replace("price: raw.price || '0 ₽'", "price: raw.price ?? ''").replace("price: '300 ₽'", "price: ''");
    return s;
  });
  edit('src/pages/Admin.jsx', s => {
    s = s.replace("import React, { useEffect, useRef, useState }", "import React, { useEffect, useState }");
    s = s.replace(/import \{ loadStore, saveStore, resetStore, wipeOldKeys, clearMenuKeys, localTs, cacheStore, TRANSITIONS, createEmptyItem, hexToRgba \} from/, 'import { TRANSITIONS, createEmptyItem, hexToRgba } from');
    s = s.replace(/import \{ fetchCloud, pushCloud, uploadRepoFile, getToken, setToken, hasToken, checkToken, normalizeTokenInput \} from/, 'import { uploadRepoFile, setToken, hasToken } from');
    s = s.replace("import CanvasStage from '../components/CanvasStage';", "import CanvasStage from '../components/CanvasStage';\nimport useEditor from '../lib/useEditor';\nimport { PLACEHOLDER } from '../lib/config';");
    const start = s.indexOf('  const [store, setStore]'); const end = s.indexOf('  const screen = store.screens.find', start);
    if (start < 0 || end < 0) throw new Error('Editor markers missing');
    s = s.slice(0, start) + `  const { store, setStore, cloud, setCloud, cloudNewer, setCloudNewer, connectMsg, setConnectMsg, tokenInput, setTokenInput, ready, localError, doPush, manualPull, connectToken, testConnection, exportDraft } = useEditor();
  const [activeScreenId, setActiveScreenId] = useState('tv1');
  const [activeSlideId, setActiveSlideId] = useState('ordo-slide-1');
  const [selectedId, setSelectedId] = useState(null);
  const [, setShowCloudPanel] = useState(false);
  useEffect(() => {
    const sc = store.screens.find(s => s.id === activeScreenId) || store.screens[0];
    if (!sc) return;
    if (sc.id !== activeScreenId) setActiveScreenId(sc.id);
    if (!sc.slides.some(s => s.id === activeSlideId)) setActiveSlideId(sc.slides[0]?.id);
  }, [store, activeScreenId, activeSlideId]);
` + s.slice(end);
    s = s.replace('Cafe Menu Board — Админка', 'Суши ORDO — Админка · 6 ТВ');
    s = replace(s, 'onClick={() => { clearMenuKeys(); location.reload(); }}', 'onClick={manualPull}');
    s = s.replace('Стереть локальную копию и взять свежую из облака', 'Загрузить облачную версию с защитой черновика');
    s = s.replace('onClick={() => { saveStore(store); doPush(); }}', 'onClick={doPush}');
    s = s.replace('<header className=', `{!ready && <div className="p-3 bg-sky-900">Восстанавливаю черновик и проверяю облако…</div>}
      {localError && <div role="alert" className="p-3 bg-red-900">{localError}</div>}
      <button onClick={exportDraft} className="px-4 py-2 bg-zinc-800 text-sm">Скачать резервную копию JSON</button>
      <header className=`);
    s = s.replace('<div className="max-w-[1480px] mx-auto w-full flex flex-1 min-h-0">', '<div inert={!ready} className="max-w-[1480px] mx-auto w-full flex flex-1 min-h-0">');
    s = s.replace(/https:\/\/images\.unsplash\.com\/photo-1550547660-d9450f859349\?w=1920/g, "PLACEHOLDER_VALUE").replace(/bg: 'PLACEHOLDER_VALUE'/g, 'bg: PLACEHOLDER');
    s = s.replace("const id = 'tv' + (d.screens.length + 1);", "let n = 1; while (d.screens.some(s => s.id === 'tv' + n)) n++; const id = 'tv' + n;");
    s = s.replace('if (f.size > 90 * 1024 * 1024)', 'if (f.size > 45 * 1024 * 1024)').replace('Файл больше 90 МБ.', 'Файл больше 45 МБ.');
    s = s.replace('const dataUrl = await fileToDataUrl(f, 1920, 0.82);', `let dataUrl = await fileToDataUrl(f, 1920, 0.82);
      if (hasToken()) {
        const blob = await (await fetch(dataUrl)).blob();
        dataUrl = await uploadRepoFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      }`);
    s = s.replace("slide.bg?.startsWith('/cafe-menu-board/data/video/')", "slide.bg?.includes('/data/media/')");
    s = s.replace('до 10 мин, обычно быстрее', 'проверка каждые 10 секунд; возможна задержка сети/CDN').replace('ТВ подтягивает до 10 мин.', 'ТВ проверяют версию каждые 10 секунд; сеть/CDN могут добавить задержку.');
    s = s.replace('Пока правки сохраняются только в этом браузере. Вставь сюда длинную ссылку-подключение из файла «ПОДКЛЮЧЕНИЕ-меню.txt» (целиком, можно прямо всю ссылку):', 'Черновик сохраняется только на этом устройстве. Для публикации вставьте fine-grained GitHub-токен: только SushiOrdo, Contents: Read and write. Никому не отправляйте токен и не вставляйте его в адрес ссылки.');
    s = s.replace('placeholder="ссылка https://...#gh=... или токен gho_..."', 'type="password" autoComplete="off" placeholder="GitHub-токен только для SushiOrdo"');
    s = s.replace("= 'PLACEHOLDER_VALUE'", '= PLACEHOLDER').replace('Убрать загруженное → вернуть демо', 'Убрать фото → заставка ORDO').replace('до 90 МБ', 'до 45 МБ').replace('— видео загружено в облако —', '— медиа загружено в облако —');
    s = s.replace('Данные живут в облаке — все устройства видят одно и то же.', 'Черновик хранится на устройстве. После успешной публикации все ТВ получают облачную версию.');
    return s;
  });
  edit('src/pages/TvPlayer.jsx', s => {
    s = replace(s, "import { loadStore, cacheStore } from '../lib/store';", "import { loadTvStore as loadStore, cacheTvStore as cacheStore } from '../lib/tvCache';");
    s = s.replace("const APP_VERSION = '2026-09-28.3';", "const APP_VERSION = 'SushiOrdo-2.0';");
    s = s.replace(' || store.screens[0]', '');
    const a = s.indexOf('  // локальные изменения'); const b = s.indexOf('  // облако:', a);
    if (a < 0 || b < 0) throw new Error('Player markers missing');
    s = s.slice(0, a) + s.slice(b);
    s = s.replace("const lastCloud = useRef('');", "const lastCloud = useRef('');\n  const polling = useRef(false);\n  const [syncError, setSyncError] = useState('');");
    const p = s.indexOf('    const cloud = await fetchCloud'); const q = s.indexOf('\n  }, []);', p);
    s = s.slice(0, p) + `    if (polling.current) return;
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
    finally { polling.current = false; }` + s.slice(q);
    s = s.replace('setInterval(pollCloud, 60000)', 'setInterval(pollCloud, 10000)');
    s = s.replace("if (!slides.length) return <div", "if (!screen) return <div className=\"w-screen h-screen grid place-items-center text-white\">Суши ORDO: экран {id} не найден. Проверьте ссылку ТВ1–ТВ6 и подключение к интернету. {syncError}</div>;\n  if (!slides.length) return <div");
    s = s.replace('const current = slides[idx];', 'const current = slides[Math.min(idx, slides.length - 1)];');
    s = s.replace('<ReloadEachHour />', '{syncError && <div role="status" className="absolute bottom-1 left-2 z-30 text-xs text-amber-300 bg-black/70 px-2">{syncError}</div>}');
    s = s.replace(/\nfunction ReloadEachHour\(\).*$/s, '\n');
    return s;
  });
  edit('vite.config.js', s => s.replace("base: '/cafe-menu-board/'", "base: '/SushiOrdo/'"));
  edit('package.json', s => { const p = JSON.parse(s); p.name = 'sushi-ordo'; p.version = '2.0.0'; p.homepage = 'https://maxzakir-glitch.github.io/SushiOrdo/'; delete p.scripts.deploy; return JSON.stringify(p, null, 2) + '\n'; });
  edit('package-lock.json', s => { const p = JSON.parse(s); p.name = 'sushi-ordo'; p.version = '2.0.0'; p.packages[''].name = p.name; p.packages[''].version = p.version; return JSON.stringify(p, null, 2) + '\n'; });
  edit('index.html', s => s.replace(/<title>.*?<\/title>/, '<title>Суши ORDO · 6 ТВ</title>'));
  edit('scripts/push-data.mjs', s => s.replace('ahror1994/cafe-menu-board', 'maxzakir-glitch/SushiOrdo'));
  fs.writeFileSync('scripts/deploy.mjs', "throw new Error('Deploy only via GitHub Actions: Setup and deploy. Live data is stored separately in gh-pages.');\n");
  fs.writeFileSync('.env.example', '# SushiOrdo does not use Supabase. Never store GitHub tokens in .env or in this repository.\n');
  edit('.gitignore', s => s + '\n.env\n.env.*\n!.env.example\n');
  fs.writeFileSync(marker, 'Read-only copy of ahror1994/cafe-menu-board at ' + sha + '\n');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
